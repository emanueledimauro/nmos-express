/**
 * NMOS Express - Virtual Graph Controller (nmos_graph_virtual.html)
 */

function toggleMenu() {
            const menu = document.getElementById('dropdownMenu');
            menu.classList.toggle('hidden');
        }
        document.addEventListener('click', function (event) {
            const menu = document.getElementById('dropdownMenu');
            const btn = document.getElementById('menuBtn');
            if (menu && !menu.contains(event.target) && btn && !btn.contains(event.target)) {
                menu.classList.add('hidden');
            }
        });

let g_virtualSources = [];
        let g_virtualDestinations = [];
        let g_senders = [];
        let g_receivers = [];
        let g_sendersMap = new Map();
        let g_receiversMap = new Map();
        let g_activeConnections = {}; // receiver_id -> sender_id
        let g_senderProfiles = {};
        let g_receiverProfilesAllowed = {};

        let g_selectedDestId = null;
        let g_selectedSrcId = null;
        let g_modalSourceId = null;
        let g_modalDestId = null;

        let g_zoom = 1.0;
        let g_listenersInitialized = false;

        async function loadData() {
            const cacheBust = '?t=' + Date.now();
            try {
                const [vSrcData, vDstData, sendersData, receiversData, sLabsData, rLabsData] = await Promise.all([
                    fetch('json/JSON_virtual_sources.json' + cacheBust).then(r => r.json()),
                    fetch('json/JSON_virtual_destinations.json' + cacheBust).then(r => r.json()),
                    fetch('json/JSON_senders.json' + cacheBust).then(r => r.json()),
                    fetch('json/JSON_receivers.json' + cacheBust).then(r => r.json()),
                    fetch('json/JSON_senders_labs.json' + cacheBust).then(r => r.json()).catch(() => []),
                    fetch('json/JSON_receivers_labs.json' + cacheBust).then(r => r.json()).catch(() => [])
                ]);

                processData(vSrcData, vDstData, sendersData, receiversData, sLabsData, rLabsData);
            } catch (err) {
                console.error("Erreur chargement données virtuelles:", err);
                alert("Erreur de chargement des données : " + err.message);
            }
        }

        function processData(vSrc, vDst, senders, receivers, sLabs, rLabs) {
            g_virtualSources = vSrc || [];
            g_virtualDestinations = vDst || [];
            g_senders = senders || [];
            g_receivers = receivers || [];

            g_sendersMap.clear();
            g_receiversMap.clear();
            g_activeConnections = {};
            g_senderProfiles = {};
            g_receiverProfilesAllowed = {};

            // Map senders
            g_senders.forEach(s => {
                if (s && s.id) g_sendersMap.set(s.id, s);
            });

            // Map receivers & active subscriptions
            g_receivers.forEach(r => {
                if (r && r.id) {
                    g_receiversMap.set(r.id, r);
                    if (r.subscription_active && r.subscription_sender_id) {
                        g_activeConnections[r.id] = r.subscription_sender_id;
                    }
                }
            });

            // Profiles from labs
            (sLabs || []).forEach(x => {
                if (x && x.id && x.profile_id) g_senderProfiles[x.id] = x.profile_id;
            });
            (rLabs || []).forEach(x => {
                if (x && x.id && x.profiles_allowed !== undefined) g_receiverProfilesAllowed[x.id] = x.profiles_allowed;
            });

            renderVirtualGraph();

            if (!g_listenersInitialized) {
                g_listenersInitialized = true;
                document.getElementById('search-sources').addEventListener('input', renderVirtualGraph);
                document.getElementById('search-dests').addEventListener('input', renderVirtualGraph);
                document.getElementById('filter-coherence').addEventListener('change', renderVirtualGraph);
                window.addEventListener('resize', () => {
                    drawConnections();
                });
                window.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') closeSwitchModal();
                });
            }
        }

        // Helper pour calculer la connexion et l'alignement réel d'une destination virtuelle
        function getVirtualConnection(vDest) {
            if (!vDest) return null;

            const videoR = vDest.video_receiver || null;
            const audioR = vDest.audio_receiver || null;
            const dataR = vDest.data_receiver || null;

            const connVideo = videoR ? g_activeConnections[videoR] : null;
            const connAudio = audioR ? g_activeConnections[audioR] : null;
            const connData = dataR ? g_activeConnections[dataR] : null;

            // Priorité à virtual_sender_id déclaré
            let refVs = null;
            if (vDest.virtual_sender_id) {
                refVs = g_virtualSources.find(vs => vs.id === vDest.virtual_sender_id) || null;
            }

            // Déduction si non déclaré mais connexions actives
            if (!refVs && !vDest.virtual_sender_id) {
                let bestScore = 0;
                let candidate = null;
                for (const vs of g_virtualSources) {
                    let matches = 0;
                    if (videoR && vs.video_sender && connVideo === vs.video_sender) matches++;
                    if (audioR && vs.audio_sender && connAudio === vs.audio_sender) matches++;
                    if (dataR && vs.data_sender && connData === vs.data_sender) matches++;

                    if (matches > bestScore) {
                        bestScore = matches;
                        candidate = vs;
                    }
                }
                if (candidate && bestScore > 0) {
                    refVs = candidate;
                }
            }

            // Calcul du désalignement par essence
            const misaligned = { video: false, audio: false, data: false };
            let usedCount = 0;
            let okCount = 0;

            if (videoR) {
                usedCount++;
                if (refVs && refVs.video_sender && connVideo === refVs.video_sender) okCount++;
                else misaligned.video = true;
            }

            if (audioR) {
                usedCount++;
                if (refVs && refVs.audio_sender && connAudio === refVs.audio_sender) okCount++;
                else misaligned.audio = true;
            }

            if (dataR) {
                usedCount++;
                if (refVs && refVs.data_sender && connData === refVs.data_sender) okCount++;
                else misaligned.data = true;
            }

            let status = 'disconnected';
            if (usedCount > 0 && refVs) {
                if (okCount === usedCount) status = 'coherent';
                else if (okCount > 0) status = 'partial';
                else status = 'broken';
            }

            return {
                refSource: refVs,
                refSourceId: refVs ? refVs.id : (vDest.virtual_sender_id || null),
                refSourceLabel: refVs ? refVs.label : (vDest.virtual_sender_id || null),
                status: status, // 'coherent' | 'partial' | 'broken' | 'disconnected'
                misaligned: misaligned,
                connVideo: connVideo,
                connAudio: connAudio,
                connData: connData
            };
        }

        function renderVirtualGraph() {
            const filterSrc = document.getElementById('search-sources').value.toLowerCase().trim();
            const filterDst = document.getElementById('search-dests').value.toLowerCase().trim();
            const filterCoh = document.getElementById('filter-coherence').value;

            if (g_selectedDestId) {
                document.body.classList.add('dest-selected');
            } else {
                document.body.classList.remove('dest-selected');
            }

            if (g_selectedSrcId && !g_selectedDestId) {
                document.body.classList.add('source-selected');
            } else {
                document.body.classList.remove('source-selected');
            }

            // 1. Détection des sources concernées si filtrage par cohérence
            let allowedSourceIds = null;
            if (filterCoh === 'incoherent' || filterCoh === 'coherent') {
                allowedSourceIds = new Set();
                g_virtualDestinations.forEach(vd => {
                    const groupName = (vd.tags && vd.tags[0]) || "Sans Catégorie";
                    if (filterDst && !(vd.label || vd.id).toLowerCase().includes(filterDst) && !groupName.toLowerCase().includes(filterDst)) {
                        return;
                    }

                    const conn = getVirtualConnection(vd);
                    if (!conn) return;

                    let matches = false;
                    if (filterCoh === 'coherent' && conn.status === 'coherent') {
                        matches = true;
                    } else if (filterCoh === 'incoherent' && (conn.status === 'partial' || conn.status === 'broken')) {
                        matches = true;
                    }

                    if (matches) {
                        // Source virtuelle de référence
                        if (conn.refSourceId) {
                            allowedSourceIds.add(conn.refSourceId);
                        }
                        // Sources virtuelles réelles émettant les composantes reçues
                        g_virtualSources.forEach(vs => {
                            if (vs.video_sender && conn.connVideo && vs.video_sender === conn.connVideo) {
                                allowedSourceIds.add(vs.id);
                            }
                            if (vs.audio_sender && conn.connAudio && vs.audio_sender === conn.connAudio) {
                                allowedSourceIds.add(vs.id);
                            }
                            if (vs.data_sender && conn.connData && vs.data_sender === conn.connData) {
                                allowedSourceIds.add(vs.id);
                            }
                        });
                    }
                });
            }

            // 2. Group Sources by Tag/Category
            const srcGroups = new Map();
            g_virtualSources.forEach(vs => {
                const tag = (vs.tags && vs.tags[0]) || "Sans Catégorie";
                if (!srcGroups.has(tag)) srcGroups.set(tag, []);
                srcGroups.get(tag).push(vs);
            });

            // 3. Group Destinations by Tag/Category
            const dstGroups = new Map();
            g_virtualDestinations.forEach(vd => {
                const tag = (vd.tags && vd.tags[0]) || "Sans Catégorie";
                if (!dstGroups.has(tag)) dstGroups.set(tag, []);
                dstGroups.get(tag).push(vd);
            });

            // 4. Render Sources Column
            const colSrc = document.getElementById('col-sources');
            colSrc.querySelectorAll('.node, .empty-notice').forEach(n => n.remove());

            Array.from(srcGroups.keys()).sort().forEach(groupName => {
                let itemsInGroup = srcGroups.get(groupName);

                // Filtre textuel sources
                if (filterSrc) {
                    itemsInGroup = itemsInGroup.filter(s =>
                        (s.label || s.id).toLowerCase().includes(filterSrc) ||
                        groupName.toLowerCase().includes(filterSrc)
                    );
                }

                // Filtre par cohérence : on ne garde que les sources concernées
                if (allowedSourceIds && !g_selectedDestId) {
                    itemsInGroup = itemsInGroup.filter(s => allowedSourceIds.has(s.id));
                }

                if (itemsInGroup.length === 0) return;

                const node = document.createElement('div');
                node.className = 'node';
                node.innerHTML = `
                    <div class="node-title">
                        <span>${groupName}</span>
                        <span class="text-[11px] font-normal text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">${itemsInGroup.length}</span>
                    </div>
                    <div class="ports-container"></div>
                `;

                const container = node.querySelector('.ports-container');
                itemsInGroup.forEach(vs => {
                    const isSelectedSrc = (g_selectedSrcId === vs.id);
                    const port = document.createElement('div');
                    port.className = 'port output' + (isSelectedSrc ? ' selected-source' : '');
                    port.dataset.id = vs.id;
                    port.title = isSelectedSrc
                        ? 'Source sélectionnée (cliquez à nouveau pour annuler le filtre)'
                        : (g_selectedDestId ? 'Cliquez pour commuter vers cette source' : 'Cliquez pour filtrer les destinations recevant cette source');

                    const labelSpan = document.createElement('span');
                    labelSpan.className = 'font-semibold truncate ' + (isSelectedSrc ? 'text-white' : 'text-gray-800');
                    labelSpan.textContent = vs.label || vs.id;

                    // Essences icons
                    const iconsDiv = document.createElement('div');
                    iconsDiv.className = 'flex items-center gap-1 ml-auto mr-1';

                    if (vs.video_sender) {
                        iconsDiv.innerHTML += '<i class="fas fa-video ' + (isSelectedSrc ? 'text-blue-100' : 'text-blue-500') + ' text-[10px]" title="Vidéo disponible"></i>';
                    }
                    if (vs.audio_sender) {
                        iconsDiv.innerHTML += '<i class="fas fa-volume-up ' + (isSelectedSrc ? 'text-amber-100' : 'text-amber-500') + ' text-[10px]" title="Audio disponible"></i>';
                    }
                    if (vs.data_sender) {
                        iconsDiv.innerHTML += '<i class="fas fa-stream ' + (isSelectedSrc ? 'text-emerald-100' : 'text-emerald-500') + ' text-[10px]" title="Data disponible"></i>';
                    }

                    // Anchor point
                    const anchor = document.createElement('div');
                    anchor.className = 'anchor';

                    port.appendChild(labelSpan);
                    port.appendChild(iconsDiv);
                    port.appendChild(anchor);

                    // Click handler on Virtual Source
                    port.onclick = (e) => {
                        e.stopPropagation();
                        if (g_selectedDestId) {
                            openSwitchModal(vs.id, g_selectedDestId);
                        } else {
                            // Toggle source filter
                            g_selectedSrcId = (g_selectedSrcId === vs.id) ? null : vs.id;
                            renderVirtualGraph();
                        }
                    };

                    container.appendChild(port);
                });

                colSrc.appendChild(node);
            });

            // Notice si aucune source concernée par le filtre de cohérence
            const totalVisibleSources = colSrc.querySelectorAll('.port.output').length;
            if (allowedSourceIds && !g_selectedDestId && totalVisibleSources === 0) {
                const emptyNotice = document.createElement('div');
                emptyNotice.className = 'empty-notice p-6 bg-white border border-dashed border-gray-300 rounded-lg text-center text-gray-500 text-xs mt-2';
                emptyNotice.innerHTML = `
                    <i class="fas ${filterCoh === 'incoherent' ? 'fa-check-circle text-green-500' : 'fa-info-circle text-blue-500'} text-2xl mb-2 block"></i>
                    <p class="font-semibold text-gray-700">Aucune source concernée</p>
                    <p class="text-[11px] text-gray-500 mt-1">${filterCoh === 'incoherent' ? 'Toutes les liaisons virtuelles actuelles sont cohérentes.' : 'Aucune source ne correspond au filtre.'}</p>
                `;
                colSrc.appendChild(emptyNotice);
            }

            // 5. Render Destinations Column
            const colDst = document.getElementById('col-destinations');
            colDst.querySelectorAll('.node').forEach(n => n.remove());

            Array.from(dstGroups.keys()).sort().forEach(groupName => {
                let itemsInGroup = dstGroups.get(groupName);

                // Apply text filter
                if (filterDst) {
                    itemsInGroup = itemsInGroup.filter(d =>
                        (d.label || d.id).toLowerCase().includes(filterDst) ||
                        groupName.toLowerCase().includes(filterDst)
                    );
                }

                // Apply coherence filter
                if (filterCoh === 'coherent') {
                    itemsInGroup = itemsInGroup.filter(d => getVirtualConnection(d).status === 'coherent');
                } else if (filterCoh === 'incoherent') {
                    itemsInGroup = itemsInGroup.filter(d => {
                        const st = getVirtualConnection(d).status;
                        return st === 'partial' || st === 'broken';
                    });
                }

                // Apply Source Filter (when a source is clicked and no destination is in TAKE mode)
                if (g_selectedSrcId && !g_selectedDestId) {
                    const selVs = g_virtualSources.find(s => s.id === g_selectedSrcId);
                    itemsInGroup = itemsInGroup.filter(d => {
                        const conn = getVirtualConnection(d);
                        if (conn.refSourceId === g_selectedSrcId) return true;
                        if (selVs) {
                            if (selVs.video_sender && conn.connVideo === selVs.video_sender) return true;
                            if (selVs.audio_sender && conn.connAudio === selVs.audio_sender) return true;
                            if (selVs.data_sender && conn.connData === selVs.data_sender) return true;
                        }
                        return false;
                    });
                }

                if (itemsInGroup.length === 0) return;

                const node = document.createElement('div');
                node.className = 'node';
                node.innerHTML = `
                    <div class="node-title">
                        <span>${groupName}</span>
                        <span class="text-[11px] font-normal text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">${itemsInGroup.length}</span>
                    </div>
                    <div class="ports-container"></div>
                `;

                const container = node.querySelector('.ports-container');
                itemsInGroup.forEach(vd => {
                    const port = document.createElement('div');
                    const isSelected = (g_selectedDestId === vd.id);
                    port.className = 'port input' + (isSelected ? ' selected-dest' : '');
                    port.dataset.id = vd.id;

                    const conn = getVirtualConnection(vd);
                    let effectiveSrcId = conn.refSourceId;
                    if (!effectiveSrcId && g_selectedSrcId) {
                        const selVs = g_virtualSources.find(s => s.id === g_selectedSrcId);
                        if (selVs && ((selVs.video_sender && conn.connVideo === selVs.video_sender) ||
                            (selVs.audio_sender && conn.connAudio === selVs.audio_sender) ||
                            (selVs.data_sender && conn.connData === selVs.data_sender))) {
                            effectiveSrcId = g_selectedSrcId;
                        }
                    }
                    if (effectiveSrcId) {
                        port.dataset.sourceId = effectiveSrcId;
                    }

                    // Anchor point
                    const anchor = document.createElement('div');
                    anchor.className = 'anchor';
                    port.appendChild(anchor);

                    // Left side: Component Badges (V, A, D) with coherence status
                    const badgesDiv = document.createElement('div');
                    badgesDiv.className = 'flex items-center gap-0.5 mr-2';

                    // Video badge
                    if (vd.video_receiver) {
                        const isMis = conn.misaligned.video;
                        badgesDiv.innerHTML += `<span class="component-badge ${isMis ? 'incoherent' : 'ok'}" title="${isMis ? 'Vidéo : INCOHÉRENTE (non alignée sur ' + (conn.refSourceLabel || 'la source') + ')' : 'Vidéo : Alignée'}"><i class="fas fa-video"></i></span>`;
                    }
                    // Audio badge
                    if (vd.audio_receiver) {
                        const isMis = conn.misaligned.audio;
                        badgesDiv.innerHTML += `<span class="component-badge ${isMis ? 'incoherent' : 'ok'}" title="${isMis ? 'Audio : INCOHÉRENTE (non alignée)' : 'Audio : Alignée'}"><i class="fas fa-volume-up"></i></span>`;
                    }
                    // Data badge
                    if (vd.data_receiver) {
                        const isMis = conn.misaligned.data;
                        badgesDiv.innerHTML += `<span class="component-badge ${isMis ? 'incoherent' : 'ok'}" title="${isMis ? 'Data : INCOHÉRENTE (non alignée)' : 'Data : Alignée'}"><i class="fas fa-stream"></i></span>`;
                    }

                    // Destination label
                    const labelSpan = document.createElement('span');
                    labelSpan.className = 'font-semibold text-gray-800 truncate mr-auto';
                    labelSpan.textContent = vd.label || vd.id;

                    // Connected source subtitle
                    const subSpan = document.createElement('span');
                    subSpan.className = 'port-sender-sub truncate max-w-[120px] text-right';
                    if (conn.status === 'coherent') {
                        subSpan.className += ' text-green-600';
                        subSpan.textContent = `(${conn.refSourceLabel})`;
                    } else if (conn.status === 'partial') {
                        subSpan.className += ' text-amber-600 font-semibold';
                        subSpan.textContent = `(⚠️ ${conn.refSourceLabel || 'Partiel'})`;
                    } else if (conn.status === 'broken') {
                        subSpan.className += ' text-red-600 font-bold';
                        subSpan.textContent = `(❌ ${conn.refSourceLabel || 'Cassé'})`;
                    } else {
                        subSpan.className += ' text-gray-400';
                        subSpan.textContent = '(Non relié)';
                    }

                    port.appendChild(badgesDiv);
                    port.appendChild(labelSpan);
                    port.appendChild(subSpan);

                    // Click handler on Virtual Destination
                    port.onclick = (e) => {
                        e.stopPropagation();
                        if (g_selectedDestId === vd.id) {
                            // Re-click deselects and reloads view
                            g_selectedDestId = null;
                            renderVirtualGraph();
                        } else {
                            g_selectedDestId = vd.id;
                            g_selectedSrcId = null; // Clear source filter to display all candidate sources for TAKE
                            renderVirtualGraph();
                        }
                    };

                    container.appendChild(port);
                });

                colDst.appendChild(node);
            });

            // Update source filter banner and empty state
            const banner = document.getElementById('source-filter-banner');
            const bannerName = document.getElementById('filter-src-name');
            if (g_selectedSrcId && !g_selectedDestId) {
                const selVs = g_virtualSources.find(s => s.id === g_selectedSrcId);
                const sName = selVs ? (selVs.label || selVs.id) : g_selectedSrcId;
                const totalVisibleDests = colDst.querySelectorAll('.port.input').length;
                if (banner && bannerName) {
                    banner.classList.remove('hidden');
                    bannerName.textContent = `${sName} (${totalVisibleDests} destination${totalVisibleDests > 1 ? 's' : ''})`;
                }

                if (totalVisibleDests === 0) {
                    const emptyNotice = document.createElement('div');
                    emptyNotice.className = 'p-6 bg-white border border-dashed border-gray-300 rounded-lg text-center text-gray-500 text-xs mt-2';
                    emptyNotice.innerHTML = `
                        <i class="fas fa-satellite-dish text-2xl text-gray-400 mb-2 block"></i>
                        <p class="font-semibold text-gray-700">Aucune destination connectée</p>
                        <p class="text-[11px] text-gray-500 mt-1">Cette source virtuelle n'est actuellement routée vers aucune destination.</p>
                        <button id="btn-reset-src-filter" class="mt-3 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs border border-gray-300 transition">
                            <i class="fas fa-undo mr-1"></i> Afficher toutes les destinations
                        </button>
                    `;
                    emptyNotice.querySelector('#btn-reset-src-filter').onclick = () => {
                        g_selectedSrcId = null;
                        renderVirtualGraph();
                    };
                    colDst.appendChild(emptyNotice);
                }
            } else {
                if (banner) banner.classList.add('hidden');
            }

            // Draw connections delay
            setTimeout(() => {
                drawConnections();
            }, 100);
        }

        function drawConnections() {
            const svg = document.getElementById('connections');
            const canvas = document.getElementById('graph-canvas');
            svg.setAttribute('width', canvas.scrollWidth);
            svg.setAttribute('height', canvas.scrollHeight);
            svg.innerHTML = '';

            const sourceElements = {};
            document.querySelectorAll('#col-sources .port.output').forEach(el => {
                const id = el.dataset.id;
                if (id) sourceElements[id] = el;
            });

            document.querySelectorAll('#col-destinations .port.input').forEach(inputPort => {
                const srcId = inputPort.dataset.sourceId;
                const dstId = inputPort.dataset.id;
                if (!srcId || !sourceElements[srcId]) return;

                const vDst = g_virtualDestinations.find(d => d.id === dstId);
                const conn = getVirtualConnection(vDst);

                const outputPort = sourceElements[srcId];

                let color = stringToColor(srcId);
                let isIncoherent = false;

                if (conn.status === 'broken') {
                    color = '#ef4444'; // Red
                    isIncoherent = true;
                } else if (conn.status === 'partial') {
                    color = '#f59e0b'; // Amber
                    isIncoherent = true;
                }

                drawCurve(svg, outputPort, inputPort, color, isIncoherent);
            });
        }

        function drawCurve(svg, startElem, endElem, color, isIncoherent = false) {
            const canvas = document.getElementById('graph-canvas');
            const canvasRect = canvas.getBoundingClientRect();

            const startAnchor = startElem.querySelector('.anchor');
            const endAnchor = endElem.querySelector('.anchor');
            if (!startAnchor || !endAnchor) return;

            const startRect = startAnchor.getBoundingClientRect();
            const endRect = endAnchor.getBoundingClientRect();

            const x1 = (startRect.left + startRect.width / 2 - canvasRect.left) / g_zoom;
            const y1 = (startRect.top + startRect.height / 2 - canvasRect.top) / g_zoom;

            const x2 = (endRect.left + endRect.width / 2 - canvasRect.left) / g_zoom;
            const y2 = (endRect.top + endRect.height / 2 - canvasRect.top) / g_zoom;

            const dist = Math.abs(x2 - x1);
            const controlOffset = Math.max(dist * 0.45, 60);

            const cp1x = x1 + controlOffset;
            const cp1y = y1;
            const cp2x = x2 - controlOffset;
            const cp2y = y2;

            const d = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            path.style.stroke = color;
            if (isIncoherent) {
                path.classList.add('incoherent');
            }
            if (g_selectedSrcId) {
                const startId = startElem.dataset.id;
                if (startId === g_selectedSrcId) {
                    path.style.strokeWidth = '3.5px';
                    path.style.opacity = '1';
                } else {
                    path.style.opacity = '0.25';
                }
            }

            svg.appendChild(path);
        }

        function stringToColor(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
            return '#' + '00000'.substring(0, 6 - c.length) + c;
        }

        // --- COMMUTATION VIRTUELLE (POPUP MODAL) ---

        function openSwitchModal(srcId, dstId) {
            g_modalSourceId = srcId;
            g_modalDestId = dstId;

            const vSrc = g_virtualSources.find(s => s.id === srcId);
            const vDst = g_virtualDestinations.find(d => d.id === dstId);
            if (!vSrc || !vDst) return;

            const conn = getVirtualConnection(vDst);

            document.getElementById('modal-src-label').textContent = vSrc.label || vSrc.id;
            document.getElementById('modal-src-category').textContent = (vSrc.tags && vSrc.tags.join(' / ')) || '';

            document.getElementById('modal-dst-label').textContent = vDst.label || vDst.id;
            document.getElementById('modal-dst-category').textContent = (vDst.tags && vDst.tags.join(' / ')) || '';
            document.getElementById('modal-dst-current').textContent = conn.refSourceLabel ? ('Actuellement relié à : ' + conn.refSourceLabel) : 'Actuellement non relié';

            // Detail of planned component switches
            const listContainer = document.getElementById('modal-components-list');
            listContainer.innerHTML = '';

            const components = [
                { media: 'Vidéo', icon: 'fa-video', sId: vSrc.video_sender, rId: vDst.video_receiver },
                { media: 'Audio', icon: 'fa-volume-up', sId: vSrc.audio_sender, rId: vDst.audio_receiver },
                { media: 'Data', icon: 'fa-stream', sId: vSrc.data_sender, rId: vDst.data_receiver }
            ];

            let hasIncompatibleProfile = false;

            components.forEach(c => {
                const row = document.createElement('div');
                row.className = 'px-3 py-2 flex items-center justify-between text-xs';

                if (!c.sId && !c.rId) {
                    row.innerHTML = `
                        <div class="flex items-center gap-2 text-gray-400">
                            <i class="fas ${c.icon} w-4 text-center"></i>
                            <span>${c.media}</span>
                        </div>
                        <span class="text-gray-400 italic">Non configuré</span>
                    `;
                } else if (c.sId && c.rId) {
                    const sObj = g_sendersMap.get(c.sId);
                    const rObj = g_receiversMap.get(c.rId);
                    const sName = sObj ? (sObj.custom_label || sObj.label || c.sId.substring(0, 8)) : c.sId.substring(0, 8);
                    const rName = rObj ? (rObj.custom_label || rObj.label || c.rId.substring(0, 8)) : c.rId.substring(0, 8);

                    const isCompat = checkProfile(c.sId, c.rId);
                    if (!isCompat) hasIncompatibleProfile = true;

                    row.innerHTML = `
                        <div class="flex items-center gap-2 font-medium text-gray-700">
                            <i class="fas ${c.icon} w-4 text-center text-blue-500"></i>
                            <span>${c.media}</span>
                        </div>
                        <div class="flex items-center gap-2 text-gray-600 font-mono text-[11px]">
                            <span class="truncate max-w-[140px]" title="${sName}">${sName}</span>
                            <i class="fas fa-arrow-right text-gray-400"></i>
                            <span class="truncate max-w-[140px]" title="${rName}">${rName}</span>
                            ${!isCompat ? '<span class="text-amber-600 font-bold" title="Profil incompatible">⚠️</span>' : '<span class="text-green-600">✓</span>'}
                        </div>
                    `;
                } else {
                    row.innerHTML = `
                        <div class="flex items-center gap-2 text-amber-700">
                            <i class="fas ${c.icon} w-4 text-center"></i>
                            <span>${c.media}</span>
                        </div>
                        <span class="text-amber-600 text-[11px]">${c.sId ? 'Pas de récepteur sur la destination' : "Pas d'émetteur sur la source"}</span>
                    `;
                }

                listContainer.appendChild(row);
            });

            // Warning if profile incompatible
            const warnBox = document.getElementById('modal-profile-warn');
            if (hasIncompatibleProfile) {
                warnBox.classList.remove('hidden');
            } else {
                warnBox.classList.add('hidden');
            }

            // Reset error & buttons
            document.getElementById('switch-modal-error').classList.add('hidden');
            const takeBtn = document.getElementById('modal-take-btn');
            takeBtn.disabled = false;
            takeBtn.innerHTML = '<i class="fas fa-bolt"></i> TAKE';

            document.getElementById('switch-modal').classList.remove('hidden');
        }

        function closeSwitchModal() {
            document.getElementById('switch-modal').classList.add('hidden');
            g_modalSourceId = null;
            g_modalDestId = null;
        }

        function checkProfile(srcId, dstId) {
            if (!Object.prototype.hasOwnProperty.call(g_receiverProfilesAllowed, dstId)) return true;
            const allowed = g_receiverProfilesAllowed[dstId];
            if (!allowed || allowed === "*") return true;
            const sProf = g_senderProfiles[srcId] || null;
            if (!sProf) return false;
            if (Array.isArray(allowed)) return allowed.includes(sProf);
            return allowed === sProf;
        }

        async function handleModalTake() {
            const srcId = g_modalSourceId;
            const dstId = g_modalDestId;
            if (!srcId || !dstId) return;

            const vSrc = g_virtualSources.find(s => s.id === srcId);
            const vDst = g_virtualDestinations.find(d => d.id === dstId);
            if (!vSrc || !vDst) return;

            const takeBtn = document.getElementById('modal-take-btn');
            const errBox = document.getElementById('switch-modal-error');
            const errText = document.getElementById('switch-modal-error-text');

            takeBtn.disabled = true;
            takeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Commutation en cours...';
            errBox.classList.add('hidden');

            const plan = [];
            if (vSrc.video_sender && vDst.video_receiver) {
                plan.push({ media: 'Vidéo', sId: vSrc.video_sender, rId: vDst.video_receiver });
            }
            if (vSrc.audio_sender && vDst.audio_receiver) {
                plan.push({ media: 'Audio', sId: vSrc.audio_sender, rId: vDst.audio_receiver });
            }
            if (vSrc.data_sender && vDst.data_receiver) {
                plan.push({ media: 'Data', sId: vSrc.data_sender, rId: vDst.data_receiver });
            }

            try {
                // 1. Commuter les flux NMOS
                for (const p of plan) {
                    const r = await fetch("php/api_switch.php", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sender_id: p.sId, receiver_id: p.rId })
                    });
                    const res = await r.json().catch(() => null);
                    if (!r.ok || !res || !res.ok) {
                        throw new Error(`Échec sur ${p.media} : ` + ((res && res.error) || ('HTTP ' + r.status)));
                    }
                    g_activeConnections[p.rId] = p.sId;
                }

                // 2. Enregistrer la liaison virtuelle dans php/api_virtual.php
                await fetch("php/api_virtual.php?action=save_connection&type=destinations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        dest_id: vDst.id,
                        virtual_sender_id: vSrc.id
                    })
                });

                // Update in memory
                vDst.virtual_sender_id = vSrc.id;

                // Close and refresh
                closeSwitchModal();
                g_selectedDestId = null;
                await loadData();

            } catch (err) {
                console.error("Erreur commutation virtuelle:", err);
                takeBtn.disabled = false;
                takeBtn.innerHTML = '<i class="fas fa-bolt"></i> Réessayer TAKE';
                errBox.classList.remove('hidden');
                errText.textContent = err.message || "Une erreur est survenue.";
            }
        }

        // --- ZOOM & FULLSCREEN ---

        function applyZoom() {
            const canvas = document.getElementById('graph-canvas');
            const label = document.getElementById('zoom-level');
            if (label) label.textContent = Math.round(g_zoom * 100) + '%';
            if (canvas) {
                canvas.style.transform = `scale(${g_zoom})`;
                canvas.style.width = g_zoom < 1 ? `${100 / g_zoom}%` : '100%';
            }
            setTimeout(() => {
                drawConnections();
            }, 50);
        }

        function changeZoom(delta) {
            g_zoom = Math.min(1.5, Math.max(0.5, Math.round((g_zoom + delta) * 10) / 10));
            applyZoom();
        }

        function resetZoom() {
            g_zoom = 1.0;
            applyZoom();
        }

        function toggleFullscreen() {
            const workspace = document.getElementById('graph-workspace');
            if (!document.fullscreenElement) {
                if (workspace && workspace.requestFullscreen) {
                    workspace.requestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        }

        document.addEventListener('fullscreenchange', () => {
            const icon = document.getElementById('fullscreen-icon');
            if (icon) {
                if (document.fullscreenElement) {
                    icon.classList.remove('fa-expand');
                    icon.classList.add('fa-compress-arrows-alt');
                } else {
                    icon.classList.remove('fa-compress-arrows-alt');
                    icon.classList.add('fa-expand');
                }
            }
            setTimeout(() => {
                drawConnections();
            }, 100);
        });

        window.addEventListener("i18n:changed", () => {
            renderVirtualGraph();
        });

        // Deselect when clicking on canvas background
        function setupBackgroundClick() {
            const container = document.getElementById('graph-container');
            if (container) {
                container.addEventListener('click', (e) => {
                    if (!e.target.closest('.port') && !e.target.closest('#switchModal') && !e.target.closest('#source-filter-banner')) {
                        if (g_selectedDestId !== null || g_selectedSrcId !== null) {
                            g_selectedDestId = null;
                            g_selectedSrcId = null;
                            renderVirtualGraph();
                        }
                    }
                });
            }
        }

        // Init
        window.onload = async () => {
            setupBackgroundClick();
            await initI18n({ url: "json/i18n.json", selectId: "langSelect" });
            loadData();
        };

// Expose functions & variables globally for inline HTML event handlers & dynamic templates
window.toggleMenu = toggleMenu;
window.loadData = loadData;
window.processData = processData;
window.getVirtualConnection = getVirtualConnection;
window.renderVirtualGraph = renderVirtualGraph;
window.drawConnections = drawConnections;
window.drawCurve = drawCurve;
window.stringToColor = stringToColor;
window.openSwitchModal = openSwitchModal;
window.closeSwitchModal = closeSwitchModal;
window.checkProfile = checkProfile;
window.handleModalTake = handleModalTake;
window.applyZoom = applyZoom;
window.changeZoom = changeZoom;
window.resetZoom = resetZoom;
window.toggleFullscreen = toggleFullscreen;
window.setupBackgroundClick = setupBackgroundClick;

Object.defineProperty(window, 'g_selectedSrcId', {
    get: function() { return g_selectedSrcId; },
    set: function(v) { g_selectedSrcId = v; },
    configurable: true
});

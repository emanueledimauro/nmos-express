/**
 * NMOS Express - Graph Visualizer Controller (nmos_graph.html)
 */

function toggleMenu() {
            const menu = document.getElementById('dropdownMenu');
            menu.classList.toggle('hidden');
        }

        // Close menu when clicking outside
        document.addEventListener('click', function (event) {
            const menu = document.getElementById('dropdownMenu');
            const btn = document.getElementById('menuBtn');
            if (!menu.contains(event.target) && !btn.contains(event.target)) {
                menu.classList.add('hidden');
            }
        });

// --- DATA LOADING & PROCESSING ---

        // Global variables to store processed data for re-rendering
        let g_allSenders = [];
        let g_allReceivers = [];
        let g_labSenders = [];
        let g_labReceivers = [];
        let g_filteredSenders = [];
        let g_filteredReceivers = [];
        let g_sendersById = new Map();
        let g_receiversById = new Map();
        let g_senderProfiles = {};
        let g_receiverProfilesAllowed = {};

        let g_activeSenders = [];
        let g_activeReceivers = [];
        let g_categoryMap = new Map(); // ID -> Category
        let g_senderLabelMap = new Map(); // Sender ID -> Display Label
        let g_zoom = 1.0;
        let g_selectedSenderId = null;
        let g_selectedSourceGroup = null;
        let g_selectedReceiverId = null;

        let g_mediaFilter = {
            video: true,
            audio: true,
            data: true
        };

        function toggleMediaType(type) {
            if (type === 'video') g_mediaFilter.video = !g_mediaFilter.video;
            if (type === 'audio') g_mediaFilter.audio = !g_mediaFilter.audio;
            if (type === 'data') g_mediaFilter.data = !g_mediaFilter.data;

            updateMediaFilterButtonsUI();
            updateView();
        }

        function updateMediaFilterButtonsUI() {
            const btnV = document.getElementById('filter-btn-video');
            const btnA = document.getElementById('filter-btn-audio');
            const btnD = document.getElementById('filter-btn-data');

            if (btnV) {
                if (g_mediaFilter.video) {
                    btnV.className = "px-2.5 py-1 text-xs font-semibold rounded-l-md border border-blue-300 bg-blue-100 text-blue-800 transition-all flex items-center gap-1.5 shadow-sm";
                    const icon = btnV.querySelector('i');
                    if (icon) icon.className = "fas fa-video text-blue-600";
                } else {
                    btnV.className = "px-2.5 py-1 text-xs font-medium rounded-l-md border border-gray-200 bg-gray-50 text-gray-400 opacity-60 hover:opacity-100 hover:bg-gray-100 transition-all flex items-center gap-1.5";
                    const icon = btnV.querySelector('i');
                    if (icon) icon.className = "fas fa-video text-gray-400";
                }
            }
            if (btnA) {
                if (g_mediaFilter.audio) {
                    btnA.className = "px-2.5 py-1 text-xs font-semibold border-t border-b border-r border-l border-amber-300 bg-amber-100 text-amber-800 transition-all flex items-center gap-1.5 shadow-sm";
                    const icon = btnA.querySelector('i');
                    if (icon) icon.className = "fas fa-volume-up text-amber-600";
                } else {
                    btnA.className = "px-2.5 py-1 text-xs font-medium border-t border-b border-r border-gray-200 bg-gray-50 text-gray-400 opacity-60 hover:opacity-100 hover:bg-gray-100 transition-all flex items-center gap-1.5";
                    const icon = btnA.querySelector('i');
                    if (icon) icon.className = "fas fa-volume-up text-gray-400";
                }
            }
            if (btnD) {
                if (g_mediaFilter.data) {
                    btnD.className = "px-2.5 py-1 text-xs font-semibold rounded-r-md border-t border-b border-r border-l border-emerald-300 bg-emerald-100 text-emerald-800 transition-all flex items-center gap-1.5 shadow-sm";
                    const icon = btnD.querySelector('i');
                    if (icon) icon.className = "fas fa-stream text-emerald-600";
                } else {
                    btnD.className = "px-2.5 py-1 text-xs font-medium rounded-r-md border-t border-b border-r border-gray-200 bg-gray-50 text-gray-400 opacity-60 hover:opacity-100 hover:bg-gray-100 transition-all flex items-center gap-1.5";
                    const icon = btnD.querySelector('i');
                    if (icon) icon.className = "fas fa-stream text-gray-400";
                }
            }
        }

        let g_modalSenderId = null;
        let g_modalReceiverId = null;
        let g_listenersInitialized = false;

        function loadData() {
            const cacheBust = '?t=' + Date.now();
            Promise.all([
                fetch('./JSON_senders.json' + cacheBust).then(res => res.json()),
                fetch('./JSON_receivers.json' + cacheBust).then(res => res.json()),
                fetch('./JSON_senders_labs.json' + cacheBust).then(res => res.json()),
                fetch('./JSON_receivers_labs.json' + cacheBust).then(res => res.json())
            ])
                .then(([allSenders, allReceivers, labSenders, labReceivers]) => {
                    processGraph(allSenders, allReceivers, labSenders, labReceivers);
                })
                .catch(err => {
                    console.error(t("graph_load_error"), err);
                    alert(t("graph_load_error") + err.message);
                });
        }

        function applyZoom() {
            const canvas = document.getElementById('graph-canvas');
            const label = document.getElementById('zoom-level');
            if (label) label.textContent = Math.round(g_zoom * 100) + '%';
            if (canvas) {
                canvas.style.transform = `scale(${g_zoom})`;
                canvas.style.width = g_zoom < 1 ? `${100 / g_zoom}%` : '100%';
            }
            setTimeout(() => {
                adjustHybridLayout();
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
                adjustHybridLayout();
                drawConnections();
            }, 150);
        });

        function processGraph(allSenders, allReceivers, labSenders, labReceivers) {
            g_allSenders = allSenders || [];
            g_allReceivers = allReceivers || [];
            g_labSenders = labSenders || [];
            g_labReceivers = labReceivers || [];

            // Reset maps
            g_categoryMap.clear();
            g_senderLabelMap.clear();
            g_sendersById.clear();
            g_receiversById.clear();
            g_senderProfiles = {};
            g_receiverProfilesAllowed = {};

            // Build Category Map and Profiles from Lab files
            g_labSenders.forEach(s => {
                if (!s || !s.id) return;
                g_categoryMap.set(s.id, s.category || "");
                if (s.profile_id) g_senderProfiles[s.id] = s.profile_id;
            });
            g_labReceivers.forEach(r => {
                if (!r || !r.id) return;
                g_categoryMap.set(r.id, r.category || "");
                if (r.profiles_allowed !== undefined) g_receiverProfilesAllowed[r.id] = r.profiles_allowed;
            });

            // Index senders & build display labels
            g_allSenders.forEach(s => {
                if (!s || !s.id) return;
                g_sendersById.set(s.id, s);
                g_senderLabelMap.set(s.id, s.custom_label || s.label || s.id.substring(0, 8));
            });
            g_labSenders.forEach(s => {
                if (!s || !s.id) return;
                if (s.label) g_senderLabelMap.set(s.id, s.label);
            });

            // Index receivers
            g_allReceivers.forEach(r => {
                if (!r || !r.id) return;
                g_receiversById.set(r.id, r);
            });

            // 0. Filter by Lab files (Whitelist)
            const allowedSenderIds = new Set(g_labSenders.map(s => s.id));
            const allowedReceiverIds = new Set(g_labReceivers.map(r => r.id));

            g_filteredSenders = g_allSenders.filter(s => allowedSenderIds.has(s.id));
            g_filteredReceivers = g_allReceivers.filter(r => allowedReceiverIds.has(r.id));

            // 1. Filter Receivers: Must have a subscription_sender_id
            const activeReceivers = g_filteredReceivers.filter(r => r.subscription_sender_id);

            // 2. Identify active Senders: Collect IDs from activeReceivers
            const activeSenderIds = new Set(activeReceivers.map(r => r.subscription_sender_id));

            // 3. Filter Senders: Must be subscribed to by at least one receiver
            const activeSenders = g_filteredSenders.filter(s => activeSenderIds.has(s.id));

            // Store globally
            g_activeSenders = activeSenders;
            g_activeReceivers = activeReceivers;

            // Verify if selected receiver is still valid
            if (g_selectedReceiverId && !g_receiversById.has(g_selectedReceiverId)) {
                g_selectedReceiverId = null;
            }

            // Initial Render
            updateView();

            // Setup Event Listeners once
            if (!g_listenersInitialized) {
                g_listenersInitialized = true;

                document.getElementById('grouping-mode').addEventListener('change', () => {
                    g_selectedSourceGroup = null;
                    updateView();
                });
                document.getElementById('connections-mode').addEventListener('change', () => {
                    updateView();
                });
                document.getElementById('search-senders').addEventListener('input', updateView);
                document.getElementById('search-receivers').addEventListener('input', updateView);

                // Re-draw on resize
                window.addEventListener('resize', () => {
                    adjustHybridLayout();
                    drawConnections();
                });

                // Escape key closes modal
                window.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        const modal = document.getElementById('switch-modal');
                        if (modal && !modal.classList.contains('hidden')) {
                            closeSwitchModal();
                        }
                    }
                });
            }
        }

        function updateView() {
            const mode = document.getElementById('grouping-mode').value;
            renderGraph(mode);
        }

        
        function updateCommutationBadge() {
            const container = document.getElementById('commutation-badge-container');
            const badge = document.getElementById('commutation-badge');
            const icon = document.getElementById('commutation-badge-icon');
            const text = document.getElementById('commutation-badge-text');

            if (!container || !badge) return;

            if (!g_selectedReceiverId) {
                container.classList.add('hidden');
                container.classList.remove('flex');
                return;
            }

            const targetRecv = g_receiversById.get(g_selectedReceiverId);
            if (!targetRecv) {
                container.classList.add('hidden');
                container.classList.remove('flex');
                return;
            }

            const mt = String(targetRecv.mediatype || '').toLowerCase();
            const destLabel = targetRecv.custom_label || targetRecv.label || targetRecv.id.substring(0, 8);

            container.classList.remove('hidden');
            container.classList.add('flex');

            let mediaName = (typeof t === 'function') ? t('media_video') : 'Vidéo';
            let colorClasses = 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100';
            let iconClass = 'fas fa-video text-blue-600';

            if (mt === 'audio') {
                mediaName = (typeof t === 'function') ? t('media_audio') : 'Audio';
                colorClasses = 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100';
                iconClass = 'fas fa-volume-up text-amber-600';
            } else if (mt === 'data') {
                mediaName = (typeof t === 'function') ? t('media_data') : 'Data';
                colorClasses = 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100';
                iconClass = 'fas fa-stream text-emerald-600';
            }

            badge.className = `inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm transition-all cursor-pointer ${colorClasses}`;
            if (icon) icon.className = iconClass;
            if (text) {
                const modeTitle = (typeof t === 'function') ? t('graph_commutation_mode', { media: mediaName }) : ('Mode commutation ' + mediaName);
                text.innerHTML = `<span class="font-bold">${modeTitle}</span> &rarr; <span class="font-semibold underline underline-offset-2">${destLabel}</span>`;
            }
        }

        function cancelCommutationMode() {
            g_selectedReceiverId = null;
            g_selectedSenderId = null;
            g_selectedSourceGroup = null;
            updateView();
        }

function renderGraph(mode) {
            const groups = new Map();
            const nodeIdToGroupName = new Map();

            // Determine active data sets based on selection & connections-mode
            const connMode = document.getElementById('connections-mode') ? document.getElementById('connections-mode').value : 'active';
            let sendersToProcess = (connMode === 'all') ? g_filteredSenders : g_activeSenders;
            let receiversToProcess = (connMode === 'all') ? g_filteredReceivers : g_activeReceivers;

            // Apply media type filter (Vidéo, Audio, Data)
            sendersToProcess = sendersToProcess.filter(s => {
                const mt = String(s.mediatype || '').toLowerCase();
                if (mt === 'video' || mt === 'mux') return g_mediaFilter.video;
                if (mt === 'audio') return g_mediaFilter.audio;
                if (mt === 'data') return g_mediaFilter.data;
                return true;
            });

            receiversToProcess = receiversToProcess.filter(r => {
                const mt = String(r.mediatype || '').toLowerCase();
                if (mt === 'video' || mt === 'mux') return g_mediaFilter.video;
                if (mt === 'audio') return g_mediaFilter.audio;
                if (mt === 'data') return g_mediaFilter.data;
                return true;
            });

            if (g_selectedReceiverId) {
                document.body.classList.add('dest-selected');
                const targetRecv = g_receiversById.get(g_selectedReceiverId);
                const targetMedia = String((targetRecv && targetRecv.mediatype) || '').toLowerCase();

                // 1. Filtrer les sources : uniquement le même mediatype que la destination sélectionnée
                sendersToProcess = g_filteredSenders.filter(s => {
                    const sMedia = String((s && s.mediatype) || '').toLowerCase();
                    return targetMedia ? (sMedia === targetMedia) : true;
                });

                // 2. Filtrer les destinations : uniquement le même mediatype (y compris dans les nœuds hybrides/traitements !)
                const baseReceivers = (connMode === 'all') ? g_filteredReceivers : g_activeReceivers;
                receiversToProcess = baseReceivers.filter(r => {
                    const rMedia = String((r && r.mediatype) || '').toLowerCase();
                    return targetMedia ? (rMedia === targetMedia) : true;
                });

                // S'assurer que la destination sélectionnée est bien présente dans receiversToProcess
                if (targetRecv && !receiversToProcess.some(r => r.id === targetRecv.id)) {
                    receiversToProcess = receiversToProcess.concat([targetRecv]);
                }
            } else {
                document.body.classList.remove('dest-selected');
            }

            // Helpers
            const getGroup = (name) => {
                if (!name) name = t("graph_uncategorized");
                if (!groups.has(name)) {
                    groups.set(name, {
                        name: name,
                        inputs: [],
                        outputs: [],
                        type: 'unknown'
                    });
                }
                return groups.get(name);
            };

            const getGroupNameForSender = (s) => {
                if (mode === 'category') return g_categoryMap.get(s.id) || t("graph_uncategorized");
                return s.equipement || t("graph_unknown_equipment");
            };

            const getGroupNameForReceiver = (r) => {
                if (mode === 'category') return g_categoryMap.get(r.id) || t("graph_uncategorized");
                return r.equipement || t("graph_unknown_equipment");
            };

            // Process Senders (Outputs)
            sendersToProcess.forEach(s => {
                const groupName = getGroupNameForSender(s);
                const group = getGroup(groupName);
                group.outputs.push(s);
                nodeIdToGroupName.set(s.id, groupName);
            });

            // Process Receivers (Inputs)
            receiversToProcess.forEach(r => {
                const groupName = getGroupNameForReceiver(r);
                const group = getGroup(groupName);
                group.inputs.push(r);
                nodeIdToGroupName.set(r.id, groupName);
            });

            // Identifier les groupes naturellement hybrides (possédant entrées ET sorties dans la base)
            const naturalHybridGroupNames = new Set();
            {
                const groupSenderNames = new Set(g_filteredSenders.map(s => getGroupNameForSender(s)));
                const groupReceiverNames = new Set(g_filteredReceivers.map(r => getGroupNameForReceiver(r)));
                groupSenderNames.forEach(name => {
                    if (groupReceiverNames.has(name)) naturalHybridGroupNames.add(name);
                });
            }

            // Déterminer le type de placement (Gauche, Centre, Droite)
            groups.forEach(g => {
                if (naturalHybridGroupNames.has(g.name)) {
                    g.type = 'hybrid'; // Reste toujours au Centre (Traitements)
                } else if (g.inputs.length === 0 && g.outputs.length > 0) {
                    g.type = 'sender'; // Gauche (Sources)
                } else if (g.inputs.length > 0 && g.outputs.length === 0) {
                    g.type = 'receiver'; // Droite (Destinations)
                } else {
                    g.type = 'hybrid'; // Centre
                }
            });

            // --- FILTERING LOGIC (Text Inputs: Sources & Destinations) ---
            const filterS = document.getElementById('search-senders').value.toLowerCase().trim();
            const filterD = document.getElementById('search-receivers').value.toLowerCase().trim();

            let filteredGroups = new Map();

            groups.forEach((g, k) => {
                let matchingOutputs = g.outputs;
                let matchingInputs = g.inputs;

                if (filterS) {
                    matchingOutputs = matchingOutputs.filter(s => {
                        const custom = (s.custom_label || '').toLowerCase();
                        const label = (s.label || '').toLowerCase();
                        const id = (s.id || '').toLowerCase();
                        const equip = (s.equipement || '').toLowerCase();
                        const cat = (g.name || '').toLowerCase();
                        return custom.includes(filterS) || label.includes(filterS) || id.includes(filterS) || equip.includes(filterS) || cat.includes(filterS);
                    });
                }

                if (filterD) {
                    matchingInputs = matchingInputs.filter(r => {
                        const custom = (r.custom_label || '').toLowerCase();
                        const label = (r.label || '').toLowerCase();
                        const id = (r.id || '').toLowerCase();
                        const equip = (r.equipement || '').toLowerCase();
                        const cat = (g.name || '').toLowerCase();
                        const senderSub = (r.subscription_sender_id ? (g_senderLabelMap.get(r.subscription_sender_id) || '') : '').toLowerCase();
                        return custom.includes(filterD) || label.includes(filterD) || id.includes(filterD) || equip.includes(filterD) || cat.includes(filterD) || senderSub.includes(filterD);
                    });
                }

                // If filterS is active, ignore groups with 0 matching outputs (unless it's a pure receiver group when filterD is not active)
                if (filterS && !filterD) {
                    if (g.outputs.length > 0 && matchingOutputs.length === 0) {
                        // All outputs were filtered out by filterS
                        return;
                    }
                }

                // If filterD is active, ignore groups with 0 matching inputs (unless it's a pure sender group when filterS is not active)
                if (filterD && !filterS) {
                    if (g.inputs.length > 0 && matchingInputs.length === 0) {
                        // All inputs were filtered out by filterD
                        return;
                    }
                }

                // If both are active, must have at least one matching output or input
                if (filterS && filterD) {
                    if (matchingOutputs.length === 0 && matchingInputs.length === 0) {
                        return;
                    }
                }

                if (matchingOutputs.length > 0 || matchingInputs.length > 0) {
                    filteredGroups.set(k, {
                        ...g,
                        outputs: matchingOutputs,
                        inputs: matchingInputs
                    });
                }
            });

            // --- FILTER BY CLICKED SOURCE (When no receiver is selected) ---
            if (!g_selectedReceiverId && (g_selectedSenderId || g_selectedSourceGroup)) {
                const nextGroups = new Map();
                filteredGroups.forEach((g, k) => {
                    const matchingInputs = g.inputs.filter(r => {
                        if (g_selectedSenderId) {
                            return r.subscription_sender_id === g_selectedSenderId;
                        }
                        if (g_selectedSourceGroup) {
                            return nodeIdToGroupName.get(r.subscription_sender_id) === g_selectedSourceGroup;
                        }
                        return true;
                    });

                    if (g.outputs.length > 0 || matchingInputs.length > 0) {
                        nextGroups.set(k, {
                            ...g,
                            inputs: matchingInputs
                        });
                    }
                });
                filteredGroups = nextGroups;
            }

            // Clear previous nodes
            ['col-senders', 'col-hybrid', 'col-receivers'].forEach(id => {
                const col = document.getElementById(id);
                const nodes = col.querySelectorAll('.node');
                nodes.forEach(n => n.remove());
            });

            renderNodes(filteredGroups);

            // Update commutation badge
            updateCommutationBadge();

            // Draw lines needs delay for layout
            setTimeout(() => {
                adjustHybridLayout();
                drawConnections();
            }, 200);
        }

        function adjustHybridLayout() {
            const colSenders = document.getElementById('col-senders');
            const colReceivers = document.getElementById('col-receivers');
            const colHybrid = document.getElementById('col-hybrid');
            const canvas = document.getElementById('graph-canvas');

            colHybrid.style.marginTop = '0px';

            const canvasRect = canvas.getBoundingClientRect();

            let senderBottom = 0;
            let receiverBottom = 0;

            if (colSenders.lastElementChild) {
                const rect = colSenders.lastElementChild.getBoundingClientRect();
                senderBottom = (rect.bottom - canvasRect.top) / g_zoom;
            }
            if (colReceivers.lastElementChild) {
                const rect = colReceivers.lastElementChild.getBoundingClientRect();
                receiverBottom = (rect.bottom - canvasRect.top) / g_zoom;
            }

            const requiredTop = Math.max(senderBottom, receiverBottom) + 50;

            if (colHybrid.children.length > 0) {
                colHybrid.style.marginTop = requiredTop + 'px';
            }
        }

        function getMediaIconClass(item) {
            const mt = String((item && item.mediatype) || '').toLowerCase();
            if (mt === 'video') return 'fas fa-video';
            if (mt === 'audio') return 'fas fa-volume-up';
            if (mt === 'data') return 'fas fa-stream';
            return '';
        }

        function comparePortLabels(a, b) {
            const la = a.custom_label || a.label || a.id || '';
            const lb = b.custom_label || b.label || b.id || '';
            return la.localeCompare(lb, undefined, { numeric: true, sensitivity: 'base' });
        }

        function renderNodes(equipments) {
            const colSenders = document.getElementById('col-senders');
            const colHybrid = document.getElementById('col-hybrid');
            const colReceivers = document.getElementById('col-receivers');

            const sortedEquips = Array.from(equipments.values()).sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
            );

            sortedEquips.forEach(eq => {
                const node = document.createElement('div');
                node.className = 'node' + (g_selectedSourceGroup === eq.name ? ' selected-source' : '');

                const totalItems = (eq.inputs ? eq.inputs.length : 0) + (eq.outputs ? eq.outputs.length : 0);

                node.innerHTML = `
                    <div class="node-title">
                        <span>${eq.name}</span>
                        <span class="text-[11px] font-normal text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">${totalItems}</span>
                    </div>
                    <div class="ports-container">
                        <div class="inputs"></div>
                        <div class="outputs"></div>
                    </div>
                `;

                if (eq.outputs.length > 0 && !g_selectedReceiverId) {
                    const titleEl = node.querySelector('.node-title');
                    titleEl.style.cursor = 'pointer';
                    titleEl.onclick = (e) => {
                        e.stopPropagation();
                        g_selectedSourceGroup = (g_selectedSourceGroup === eq.name) ? null : eq.name;
                        g_selectedSenderId = null;
                        updateView();
                    };
                }

                const inputsContainer = node.querySelector('.inputs');
                const outputsContainer = node.querySelector('.outputs');

                if (eq.inputs.length === 0) inputsContainer.style.display = 'none';
                if (eq.outputs.length === 0) outputsContainer.style.display = 'none';

                if (eq.inputs.length > 0 && eq.outputs.length > 0) {
                    const inHeader = document.createElement('div');
                    inHeader.className = 'text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-0.5';
                    inHeader.textContent = `Entrées (${eq.inputs.length})`;
                    inputsContainer.prepend(inHeader);

                    const outHeader = document.createElement('div');
                    outHeader.className = 'text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-2';
                    outHeader.textContent = `Sorties (${eq.outputs.length})`;
                    outputsContainer.prepend(outHeader);
                }

                // Render Inputs (Receivers) sorted by label
                eq.inputs.slice().sort(comparePortLabels).forEach(r => {
                    const port = document.createElement('div');
                    const isSelectedDest = (g_selectedReceiverId === r.id);
                    port.className = 'port input' + (isSelectedDest ? ' selected-dest' : '');
                    port.dataset.id = r.id; // Receiver ID
                    port.dataset.senderId = r.subscription_sender_id; // Linked Sender ID

                    // Anchor on left edge
                    const anchor = document.createElement('div');
                    anchor.className = 'anchor';
                    port.appendChild(anchor);

                    // Left content: Label + connected sender
                    const leftDiv = document.createElement('div');
                    leftDiv.className = 'flex items-center gap-1.5 truncate mr-2 min-w-0';

                    const label = r.custom_label || r.label || r.id.substring(0, 8);
                    const mainSpan = document.createElement('span');
                    mainSpan.className = 'font-semibold truncate ' + (isSelectedDest ? 'text-white' : 'text-gray-800');
                    mainSpan.textContent = label;
                    leftDiv.appendChild(mainSpan);

                    if (r.subscription_sender_id) {
                        const senderLabel = g_senderLabelMap.get(r.subscription_sender_id);
                        if (senderLabel) {
                            const subSpan = document.createElement('span');
                            subSpan.className = 'port-sender-sub truncate text-[11px] ' + (isSelectedDest ? 'text-blue-200' : 'text-gray-500');
                            subSpan.textContent = `(${senderLabel})`;
                            leftDiv.appendChild(subSpan);
                        }
                    }
                    port.appendChild(leftDiv);

                    // Right content: Essence icon
                    const iconCls = getMediaIconClass(r);
                    if (iconCls) {
                        const iconDiv = document.createElement('div');
                        iconDiv.className = 'flex items-center ml-auto flex-shrink-0';
                        let iconColor = 'text-gray-400';
                        const mt = String(r.mediatype || '').toLowerCase();
                        if (mt === 'video') iconColor = isSelectedDest ? 'text-blue-200' : 'text-blue-500';
                        else if (mt === 'audio') iconColor = isSelectedDest ? 'text-blue-200' : 'text-amber-500';
                        else if (mt === 'data') iconColor = isSelectedDest ? 'text-blue-200' : 'text-emerald-500';

                        iconDiv.innerHTML = `<i class="${iconCls} ${iconColor} text-[11px]" title="${mt}"></i>`;
                        port.appendChild(iconDiv);
                    }

                    // Click handler on Destination
                    port.onclick = (e) => {
                        e.stopPropagation();
                        if (g_selectedReceiverId === r.id) {
                            g_selectedReceiverId = null;
                            g_selectedSenderId = null;
                            g_selectedSourceGroup = null;
                            updateView();
                        } else {
                            g_selectedReceiverId = r.id;
                            g_selectedSenderId = null;
                            g_selectedSourceGroup = null;
                            updateView();
                        }
                    };

                    inputsContainer.appendChild(port);
                });

                // Render Outputs (Senders) sorted by label
                eq.outputs.slice().sort(comparePortLabels).forEach(s => {
                    const isSelectedSrc = (g_selectedSenderId === s.id);
                    const port = document.createElement('div');
                    port.className = 'port output' + (isSelectedSrc ? ' selected-source' : '');
                    port.dataset.id = s.id; // Sender ID

                    // Left content: Label
                    const label = s.custom_label || s.label || s.id.substring(0, 8);
                    const mainSpan = document.createElement('span');
                    mainSpan.className = 'font-semibold truncate mr-2 min-w-0 ' + (isSelectedSrc ? 'text-white' : 'text-gray-800');
                    mainSpan.textContent = label;
                    port.appendChild(mainSpan);

                    // Right content: Essence icon
                    const iconCls = getMediaIconClass(s);
                    if (iconCls) {
                        const iconDiv = document.createElement('div');
                        iconDiv.className = 'flex items-center ml-auto flex-shrink-0';
                        let iconColor = 'text-gray-400';
                        const mt = String(s.mediatype || '').toLowerCase();
                        if (mt === 'video') iconColor = isSelectedSrc ? 'text-emerald-100' : 'text-blue-500';
                        else if (mt === 'audio') iconColor = isSelectedSrc ? 'text-emerald-100' : 'text-amber-500';
                        else if (mt === 'data') iconColor = isSelectedSrc ? 'text-emerald-100' : 'text-emerald-500';

                        iconDiv.innerHTML = `<i class="${iconCls} ${iconColor} text-[11px]" title="${mt}"></i>`;
                        port.appendChild(iconDiv);
                    }

                    // Anchor on right edge
                    const anchor = document.createElement('div');
                    anchor.className = 'anchor';
                    port.appendChild(anchor);

                    // Click handler on Source
                    port.onclick = (e) => {
                        e.stopPropagation();
                        if (g_selectedReceiverId) {
                            openSwitchModal(s.id, g_selectedReceiverId);
                        } else {
                            g_selectedSenderId = (g_selectedSenderId === s.id) ? null : s.id;
                            g_selectedSourceGroup = null;
                            updateView();
                        }
                    };

                    outputsContainer.appendChild(port);
                });

                // Append to correct column
                if (eq.type === 'sender') colSenders.appendChild(node);
                else if (eq.type === 'receiver') colReceivers.appendChild(node);
                else colHybrid.appendChild(node);
            });
        }

        // --- POPUP SWITCH MODAL LOGIC ---

        function isProfileCompatible(sourceId, destId) {
            if (!g_labSenders.some(s => s.id === sourceId)) return true;
            if (!Object.prototype.hasOwnProperty.call(g_receiverProfilesAllowed, destId)) return true;

            const allowed = g_receiverProfilesAllowed[destId];
            if (!allowed || allowed === "*") return true;

            const senderProfile = g_senderProfiles[sourceId] || null;
            if (!senderProfile) return false;

            if (Array.isArray(allowed)) {
                return allowed.includes(senderProfile);
            }
            return allowed === senderProfile;
        }

        function openSwitchModal(senderId, receiverId) {
            g_modalSenderId = senderId;
            g_modalReceiverId = receiverId;

            const sender = g_sendersById.get(senderId);
            const receiver = g_receiversById.get(receiverId);

            // Source recap
            const sLabel = (sender && (sender.custom_label || sender.label)) || senderId.substring(0, 8);
            const sGroup = g_categoryMap.get(senderId) || (sender && sender.equipement) || '';
            const sMedia = (sender && sender.mediatype) || 'video';
            const sIcon = getMediaIconClass(sender);

            const sLabelEl = document.getElementById('modal-source-label');
            sLabelEl.textContent = sLabel;
            sLabelEl.title = sLabel + ' (' + senderId + ')';
            document.getElementById('modal-source-group').textContent = sGroup;
            const sMediaEl = document.getElementById('modal-source-media');
            sMediaEl.innerHTML = `<i class="${sIcon}"></i> <span class="capitalize">${sMedia}</span>`;

            // Destination recap
            const rLabel = (receiver && (receiver.custom_label || receiver.label)) || receiverId.substring(0, 8);
            const rGroup = g_categoryMap.get(receiverId) || (receiver && receiver.equipement) || '';
            const rMedia = (receiver && receiver.mediatype) || 'video';
            const rIcon = getMediaIconClass(receiver);

            const rLabelEl = document.getElementById('modal-dest-label');
            rLabelEl.textContent = rLabel;
            rLabelEl.title = rLabel + ' (' + receiverId + ')';
            document.getElementById('modal-dest-group').textContent = rGroup;
            const rMediaEl = document.getElementById('modal-dest-media');
            rMediaEl.innerHTML = `<i class="${rIcon}"></i> <span class="capitalize">${rMedia}</span>`;

            // Current connected source on destination
            const currentSub = receiver && receiver.subscription_sender_id;
            const currentSubLabel = currentSub ? (g_senderLabelMap.get(currentSub) || currentSub.substring(0, 8)) : null;
            const currentSubEl = document.getElementById('modal-dest-current');
            if (currentSubLabel) {
                currentSubEl.textContent = 'Actuellement : ' + currentSubLabel;
            } else {
                currentSubEl.textContent = 'Actuellement : Non raccordé';
            }

            // Check profile compatibility
            const warnBox = document.getElementById('modal-profile-warn');
            const isCompat = isProfileCompatible(senderId, receiverId);
            if (!isCompat) {
                const sProf = g_senderProfiles[senderId] || '(aucun profil)';
                const allowed = g_receiverProfilesAllowed[receiverId];
                const allowedStr = Array.isArray(allowed) ? allowed.join(', ') : String(allowed);
                document.getElementById('modal-profile-warn-text').textContent =
                    `Attention : Profil source incompatible (${sProf} non autorisé par le récepteur [${allowedStr}]).`;
                warnBox.classList.remove('hidden');
            } else {
                warnBox.classList.add('hidden');
            }

            // Reset error display
            const errBox = document.getElementById('switch-modal-error');
            errBox.classList.add('hidden');
            document.getElementById('switch-modal-error-text').textContent = '';

            // Reset Take button
            const takeBtn = document.getElementById('modal-take-btn');
            takeBtn.disabled = false;
            takeBtn.innerHTML = '<i class="fas fa-bolt"></i> TAKE';

            // Show modal
            document.getElementById('switch-modal').classList.remove('hidden');
        }

        function closeSwitchModal() {
            document.getElementById('switch-modal').classList.add('hidden');
            g_modalSenderId = null;
            g_modalReceiverId = null;
        }

        async function handleModalTake() {
            const senderId = g_modalSenderId;
            const receiverId = g_modalReceiverId;
            if (!senderId || !receiverId) return;

            const takeBtn = document.getElementById('modal-take-btn');
            const errBox = document.getElementById('switch-modal-error');
            const errText = document.getElementById('switch-modal-error-text');

            if (!isProfileCompatible(senderId, receiverId)) {
                errBox.classList.remove('hidden');
                errText.textContent = "Commutation refusée : le profil de la source n'est pas autorisé par ce récepteur.";
                return;
            }

            errBox.classList.add('hidden');
            takeBtn.disabled = true;
            takeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Commutation en cours...';

            try {
                const response = await fetch('api_switch.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sender_id: senderId, receiver_id: receiverId })
                });

                const data = await response.json().catch(() => null);

                if (!response.ok || !data || !data.ok) {
                    const msg = (data && data.error) ? data.error : ('Échec de commutation (HTTP ' + response.status + ')');
                    throw new Error(msg);
                }

                // Success! Close modal and refresh graph
                closeSwitchModal();
                g_selectedReceiverId = null;
                g_selectedSenderId = null;
                g_selectedSourceGroup = null;

                // Reload data from files so connection line is updated
                loadData();

            } catch (err) {
                console.error("Commutation failure:", err);
                takeBtn.disabled = false;
                takeBtn.innerHTML = '<i class="fas fa-bolt"></i> Réessayer TAKE';
                errBox.classList.remove('hidden');
                errText.textContent = err.message || "Une erreur inattendue est survenue.";
            }
        }

        function drawConnections(receivers, senders) {
            const svg = document.getElementById('connections');
            const canvas = document.getElementById('graph-canvas');
            svg.setAttribute('width', canvas.scrollWidth);
            svg.setAttribute('height', canvas.scrollHeight);

            svg.innerHTML = ''; // Clear existing lines

            // Map all sender output elements by ID for quick lookup
            const senderElements = {};
            document.querySelectorAll('.port.output').forEach(el => {
                const id = el.dataset.id;
                if (id) senderElements[id] = el;
            });

            // Iterate over all receivers (inputs)
            document.querySelectorAll('.port.input').forEach(inputPort => {
                const senderId = inputPort.dataset.senderId;

                // If it has a subscription and we can find the sender in the graph
                if (senderId && senderElements[senderId]) {
                    const outputPort = senderElements[senderId];
                    const color = stringToColor(senderId);
                    drawCurve(svg, outputPort, inputPort, color);
                }
            });
        }

        function drawCurve(svg, startElem, endElem, color) {
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
            const controlOffset = Math.max(dist * 0.5, 50);

            const cp1x = x1 + controlOffset;
            const cp1y = y1;
            const cp2x = x2 - controlOffset;
            const cp2y = y2;

            const d = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            path.style.stroke = color;

            svg.appendChild(path);
        }

        function stringToColor(str) {
            const parts = str.split('-');
            if (parts.length === 5) {
                const r = parts[0].substring(0, 2);
                const g = parts[3].substring(0, 2);
                const b = parts[4].slice(-2);
                return `#${r}${g}${b}`;
            }
            return '#666666';
        }

        window.addEventListener("i18n:changed", () => {
            if (g_activeSenders.length > 0 || g_activeReceivers.length > 0) {
                updateView();
            }
        });

        // Initialize
        window.onload = async () => {
            await initI18n({ url: "i18n.json", selectId: "langSelect" });
            loadData();
        };

// Expose functions globally for inline HTML event handlers & dynamic templates
window.toggleMenu = toggleMenu;
window.toggleMediaType = toggleMediaType;
window.updateMediaFilterButtonsUI = updateMediaFilterButtonsUI;
window.loadData = loadData;
window.applyZoom = applyZoom;
window.changeZoom = changeZoom;
window.resetZoom = resetZoom;
window.toggleFullscreen = toggleFullscreen;
window.processGraph = processGraph;
window.updateView = updateView;
window.renderGraph = renderGraph;
window.adjustHybridLayout = adjustHybridLayout;
window.getMediaIconClass = getMediaIconClass;
window.comparePortLabels = comparePortLabels;
window.renderNodes = renderNodes;
window.isProfileCompatible = isProfileCompatible;
window.openSwitchModal = openSwitchModal;
window.closeSwitchModal = closeSwitchModal;
window.handleModalTake = handleModalTake;
window.drawConnections = drawConnections;
window.drawCurve = drawCurve;
window.stringToColor = stringToColor;
window.cancelCommutationMode = cancelCommutationMode;
window.updateCommutationBadge = updateCommutationBadge;

/**
 * NMOS Express - Routing Panel Controller (panel.html)
 */

let sources = [];
        let destinations = [];
        let allSendersById = {};
        let nodeNameById = {};
        let activeConnections = {};

        let labsSenders = new Set();
        let labsReceivers = new Set();
        let senderProfiles = {};
        let receiverProfilesAllowed = {};

        let virtualSources = [];
        let virtualDestinations = [];

        let selectedSourceId = null;
        let selectedDestId = null;
        let currentMediaType = "video";

        let sendersLabsData = [];
        let receiversLabsData = [];

        const srcGroupInput = document.getElementById("srcGroupInput");
        const srcGroupBadges = document.getElementById("srcGroupBadges");
        const srcGroupDropdown = document.getElementById("srcGroupDropdown");
        const srcSearchInput = document.getElementById("srcSearchInput");
        const srcList = document.getElementById("srcList");

        const dstGroupInput = document.getElementById("dstGroupInput");
        const dstGroupBadges = document.getElementById("dstGroupBadges");
        const dstGroupDropdown = document.getElementById("dstGroupDropdown");
        const dstSearchInput = document.getElementById("dstSearchInput");
        const dstList = document.getElementById("dstList");

        let availableSrcGroups = [];
        let availableDstGroups = [];
        let selectedSrcTags = [];
        let selectedDstTags = [];

        const takeButton = document.getElementById("takeButton");
        const statusDiv = document.getElementById("status");
        const mediaToolbar = document.getElementById("mediaToolbar");

        async function loadJson(path) {
            const r = await fetch(path + "?_ts=" + Date.now());
            if (!r.ok) throw new Error("HTTP " + r.status + " sur " + path);
            return r.json();
        }

        function logStatus(msg) {
            console.log(msg);
            statusDiv.textContent = msg;
        }

        function getNodeName(node_id) {
            return nodeNameById[node_id] || "";
        }

        // fonction qui ne filtre pas par équipement
        // Groupement côté SOURCES
        // - si virtuel : on utilise les tags (ex: "Plateau1 / Cameras")
        // - sinon : on utilise la category provenant de JSON_senders_labs.json
        function getGroupNameFromSender(s) {
            if (s.isVirtual || s.mediatype === "virtual") {
                if (s.tags && s.tags.length > 0) {
                    return s.tags.join(" / ");
                }
                return t("virtual");
            }
            return (s.category || "").trim();
        }

        // Groupement côté DESTINATIONS
        // - si virtuel : tags
        // - sinon : category provenant de JSON_receivers_labs.json
        function getGroupNameFromReceiver(d) {
            if (d.isVirtual || d.mediatype === "virtual") {
                if (d.tags && d.tags.length > 0) {
                    return d.tags.join(" / ");
                }
                return t("virtual");
            }
            return (d.category || "").trim();
        }



        function needProfileCheck(source_id, destination_id) {
            return labsSenders.has(source_id) &&
                Object.prototype.hasOwnProperty.call(receiverProfilesAllowed, destination_id);
        }

        function isProfileCompatible(source_id, destination_id) {
            if (!needProfileCheck(source_id, destination_id)) return true;

            const allowed = receiverProfilesAllowed[destination_id];
            if (!allowed || allowed === "*") return true;

            const senderProfile = senderProfiles[source_id] || null;
            if (!senderProfile) return false;

            if (Array.isArray(allowed)) {
                return allowed.includes(senderProfile);
            }
            return allowed === senderProfile;
        }

        // Pour la vue virtuelle : déduire la source virtuelle raccordée (ou souhaitée via virtual_sender_id)
        // ainsi que l'alignement réel de chaque composante (video, audio, data)
        function getVirtualConnectionForDestination(vDest) {
            if (!vDest || !vDest.isVirtual) return null;

            const videoR = vDest.video_receiver || null;
            const audioR = vDest.audio_receiver || null;
            const dataR = vDest.data_receiver || null;

            const connVideo = videoR ? activeConnections[videoR] : null;
            const connAudio = audioR ? activeConnections[audioR] : null;
            const connData = dataR ? activeConnections[dataR] : null;

            // Option A : priorité à virtual_sender_id défini dans JSON_virtual_destinations.json
            let refVs = null;
            if (vDest.virtual_sender_id) {
                refVs = virtualSources.find(vs => vs.id === vDest.virtual_sender_id) || null;
            }

            // Si aucune source virtuelle souhaitée ET aucune connexion NMOS réelle active -> pas de source
            if (!refVs && !vDest.virtual_sender_id && !connVideo && !connAudio && !connData) {
                return null;
            }

            // Si pas de virtual_sender_id mais que des connexions réelles existent, déduire la meilleure source virtuelle
            if (!refVs && !vDest.virtual_sender_id) {
                let bestScore = 0;
                let tie = false;
                let candidate = null;

                for (const vs of virtualSources) {
                    let matchCount = 0;
                    if (videoR && vs.video_sender && connVideo === vs.video_sender) matchCount++;
                    if (audioR && vs.audio_sender && connAudio === vs.audio_sender) matchCount++;
                    if (dataR && vs.data_sender && connData === vs.data_sender) matchCount++;

                    if (matchCount > bestScore) {
                        bestScore = matchCount;
                        candidate = vs;
                        tie = false;
                    } else if (matchCount > 0 && matchCount === bestScore) {
                        tie = true;
                    }
                }

                if (candidate && (!tie || bestScore >= 2)) {
                    refVs = candidate;
                }
            }

            const misaligned = { video: false, audio: false, data: false };
            if (refVs) {
                if (videoR && refVs.video_sender && connVideo !== refVs.video_sender) misaligned.video = true;
                if (videoR && !refVs.video_sender && connVideo) misaligned.video = true;

                if (audioR && refVs.audio_sender && connAudio !== refVs.audio_sender) misaligned.audio = true;
                if (audioR && !refVs.audio_sender && connAudio) misaligned.audio = true;

                if (dataR && refVs.data_sender && connData !== refVs.data_sender) misaligned.data = true;
                if (dataR && !refVs.data_sender && connData) misaligned.data = true;
            } else {
                if (videoR) misaligned.video = true;
                if (audioR) misaligned.audio = true;
                if (dataR) misaligned.data = true;
            }

            const isFullyCoherent = !!refVs && !misaligned.video && !misaligned.audio && !misaligned.data;
            const refLabel = refVs ? refVs.display_label : (vDest.virtual_sender_id || null);

            return {
                sourceId: isFullyCoherent ? refVs.id : null,
                refSourceId: refVs ? refVs.id : (vDest.virtual_sender_id || null),
                refSourceLabel: refLabel,
                status: isFullyCoherent ? "coherent" : "incoherent",
                misaligned: misaligned
            };
        }

        function matchesGroupFilter(groupStr, selectedTags, typedText) {
            const g = (groupStr || "").toLowerCase();
            const activeTerms = selectedTags.map(t => t.toLowerCase());
            if (typedText) activeTerms.push(typedText);
            if (activeTerms.length === 0) return true;
            return activeTerms.some(term => g.includes(term));
        }

        function renderLists() {
            const sg = srcGroupInput.value.trim().toLowerCase();
            const sf = srcSearchInput.value.trim().toLowerCase();
            const dg = dstGroupInput.value.trim().toLowerCase();
            const df = dstSearchInput.value.trim().toLowerCase();
            const type = currentMediaType;

            let virtualSourceConnectedToSelectedDest = null;
            if (type === "virtual" && selectedDestId) {
                const vDest = destinations.find(d => d.mediatype === "virtual" && d.id === selectedDestId);
                if (vDest) {
                    const info = getVirtualConnectionForDestination(vDest);
                    if (info && (info.sourceId || info.refSourceId)) {
                        virtualSourceConnectedToSelectedDest = info.sourceId || info.refSourceId;
                    }
                }
            }

            const compareByDisplayLabel = (a, b) =>
                (a.display_label || "").localeCompare(b.display_label || "", undefined, { numeric: true, sensitivity: "base" });

            const srcFiltered = sources.filter(s => {
                if (s.mediatype !== type) return false;
                const g = getGroupNameFromSender(s);
                const lbl = (s.display_label || "").toLowerCase();
                return matchesGroupFilter(g, selectedSrcTags, sg) &&
                    (!sf || lbl.includes(sf));
            }).sort(compareByDisplayLabel);

            const dstFiltered = destinations.filter(d => {
                if (d.mediatype !== type) return false;
                const g = getGroupNameFromReceiver(d);
                const lbl = (d.display_label || "").toLowerCase();
                return matchesGroupFilter(g, selectedDstTags, dg) &&
                    (!df || lbl.includes(df));
            }).sort(compareByDisplayLabel);

            srcList.innerHTML = "";
            srcFiltered.forEach(s => {
                const div = document.createElement("div");
                div.className = "item";

                const isSelected = (s.id === selectedSourceId);
                let isConnectedToSelectedDest = false;

                if (type === "virtual") {
                    isConnectedToSelectedDest =
                        (virtualSourceConnectedToSelectedDest &&
                            virtualSourceConnectedToSelectedDest === s.id);
                } else {
                    isConnectedToSelectedDest =
                        selectedDestId && activeConnections[selectedDestId] === s.id;
                }

                if (isConnectedToSelectedDest) {
                    div.classList.add("connected");
                } else if (isSelected) {
                    div.classList.add("selected");
                }

                const labelSpan = document.createElement("span");
                labelSpan.textContent = s.display_label;
                div.appendChild(labelSpan);

                const iconsWrap = document.createElement("span");
                iconsWrap.className = "item-icons";
                const iconClasses = [];
                if (s.isVirtual || s.mediatype === "virtual") {
                    if (s.video_sender) iconClasses.push("fas fa-video");
                    if (s.audio_sender) iconClasses.push("fas fa-volume-up");
                    if (s.data_sender)  iconClasses.push("fas fa-stream");
                } else {
                    if (s.mediatype === "video") iconClasses.push("fas fa-video");
                    else if (s.mediatype === "audio") iconClasses.push("fas fa-volume-up");
                    else if (s.mediatype === "data") iconClasses.push("fas fa-stream");
                }
                iconClasses.forEach(cls => {
                    const ic = document.createElement("i");
                    ic.className = cls;
                    iconsWrap.appendChild(ic);
                });
                if (iconClasses.length > 0) {
                    div.appendChild(iconsWrap);
                }

                div.onclick = () => {
                    takeButton.disabled = true;
                    selectedSourceId = s.id;
                    renderLists();
                };

                srcList.appendChild(div);
            });

            dstList.innerHTML = "";
            dstFiltered.forEach(d => {
                const wrapper = document.createElement("div");
                wrapper.className = "dest-item-wrapper";

                const connBar = document.createElement("div");
                connBar.className = "dest-conn-bar";

                let currentSrcId = null;
                let incoherent = false;
                let virtInfo = null;

                if (type === "virtual") {
                    virtInfo = getVirtualConnectionForDestination(d);
                    if (!virtInfo) {
                        currentSrcId = null;
                    } else {
                        currentSrcId = virtInfo.sourceId;
                        incoherent = (virtInfo.status === "incoherent");
                    }
                } else {
                    currentSrcId = activeConnections[d.id];
                }

                if (!currentSrcId) {
                    if (type === "virtual" && incoherent) {
                        if (virtInfo && virtInfo.refSourceLabel) {
                            connBar.textContent = `${virtInfo.refSourceLabel} (${t("panel_conn_incoherent")})`;
                        } else {
                            connBar.textContent = t("panel_conn_incoherent");
                        }
                    } else {
                        connBar.textContent = t("panel_conn_no_source");
                    }
                    connBar.classList.add("none");
                } else {
                    if (type === "virtual") {
                        const srcObj = virtualSources.find(vs => vs.id === currentSrcId);
                        connBar.textContent = srcObj ? srcObj.display_label : t("panel_conn_virtual_source");
                    } else {
                        const srcObj = allSendersById[currentSrcId];
                        if (srcObj && srcObj.custom_label) {
                            connBar.textContent = srcObj.custom_label;
                        } else if (srcObj) {
                            connBar.textContent = t("panel_conn_unconfigured_source");
                        } else {
                            connBar.textContent = t("panel_conn_unknown_source");
                        }
                    }
                    connBar.classList.add("has");
                }
                wrapper.appendChild(connBar);

                const destDiv = document.createElement("div");
                destDiv.className = "item dest-item";

                if (d.id === selectedDestId) {
                    destDiv.classList.add("selected");
                }

                const destLabelSpan = document.createElement("span");
                destLabelSpan.textContent = d.display_label;
                destDiv.appendChild(destLabelSpan);

                const destIconsWrap = document.createElement("span");
                destIconsWrap.className = "item-icons";
                const destIcons = [];
                if (d.isVirtual || d.mediatype === "virtual") {
                    const mis = (virtInfo && virtInfo.misaligned) ? virtInfo.misaligned : {};
                    if (d.video_receiver) destIcons.push({ cls: "fas fa-video", red: !!mis.video });
                    if (d.audio_receiver) destIcons.push({ cls: "fas fa-volume-up", red: !!mis.audio });
                    if (d.data_receiver)  destIcons.push({ cls: "fas fa-stream", red: !!mis.data });
                } else {
                    if (d.mediatype === "video") destIcons.push({ cls: "fas fa-video", red: false });
                    else if (d.mediatype === "audio") destIcons.push({ cls: "fas fa-volume-up", red: false });
                    else if (d.mediatype === "data") destIcons.push({ cls: "fas fa-stream", red: false });
                }
                destIcons.forEach(obj => {
                    const ic = document.createElement("i");
                    ic.className = obj.cls + (obj.red ? " icon-misaligned" : "");
                    destIconsWrap.appendChild(ic);
                });
                if (destIcons.length > 0) {
                    destDiv.appendChild(destIconsWrap);
                }

                destDiv.onclick = () => {
                    if (selectedDestId !== d.id) {
                        selectedDestId = d.id;
                        selectedSourceId = null;
                    }
                    renderLists();
                };

                wrapper.appendChild(destDiv);
                dstList.appendChild(wrapper);
            });

            takeButton.disabled = !(selectedSourceId && selectedDestId);
        }

        async function doTake() {
            if (!selectedSourceId || !selectedDestId) return;

            // Mode VIRTUEL : on commute vidéo / audio / data selon les mappings
            if (currentMediaType === "virtual") {
                const vSrc = virtualSources.find(v => v.id === selectedSourceId);
                const vDst = virtualDestinations.find(v => v.id === selectedDestId);

                if (!vSrc || !vDst) {
                    alert(t("panel_err_virtual_not_found"));
                    return;
                }

                const pairs = [
                    { media: t("video").toLowerCase(), sender_id: vSrc.video_sender, receiver_id: vDst.video_receiver },
                    { media: t("audio").toLowerCase(), sender_id: vSrc.audio_sender, receiver_id: vDst.audio_receiver },
                    { media: t("data").toLowerCase(), sender_id: vSrc.data_sender, receiver_id: vDst.data_receiver }
                ].filter(p => p.sender_id && p.receiver_id);

                if (pairs.length === 0) {
                    alert(t("panel_err_no_valid_virtual_pair"));
                    return;
                }

                takeButton.disabled = true;
                takeButton.textContent = t("panel_take_in_progress");

                let okCount = 0;
                const failed = [];

                for (const p of pairs) {
                    if (!isProfileCompatible(p.sender_id, p.receiver_id)) {
                        failed.push(p.media + " (" + t("panel_err_profile_not_allowed_short") + ")");
                        continue;
                    }

                    try {
                        logStatus(t("panel_status_switching_media", { media: p.media, src: p.sender_id, dst: p.receiver_id }));
                        const r = await fetch("api_switch.php", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ sender_id: p.sender_id, receiver_id: p.receiver_id })
                        });

                        const res = await r.json();
                        if (!res.ok) throw new Error(res.error || "switch failed");

                        // On met à jour activeConnections à partir du receiver réel
                        activeConnections[p.receiver_id] = p.sender_id;
                        okCount++;
                    } catch (e) {
                        console.error(e);
                        failed.push(p.media + " (" + e.message + ")");
                    }
                }

                logStatus(t("panel_status_virtual_switch", { ok: okCount, err: failed.length }));

                // enregistrement de la commutation virtuelle
                try {
                    await fetch("api_virtual.php?action=save_connection&type=destinations", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            dest_id: vDst.id,
                            virtual_sender_id: vSrc.id
                        })
                    });

                    // Mise à jour éventuelle en mémoire (utile si un autre écran lit virtualDestinations)
                    const idx = virtualDestinations.findIndex(d => d.id === vDst.id);
                    if (idx !== -1) {
                        virtualDestinations[idx].virtual_sender_id = vSrc.id;
                    }
                } catch (e) {
                    console.error("Erreur sauvegarde connexion virtuelle :", e);
                    // On ne bloque pas l'utilisateur, la commutation NMOS est déjà faite
                }

                if (failed.length) {
                    alert(t("panel_err_on_list") + failed.join(", "));
                }

                takeButton.textContent = t("panel_take_btn");
                renderLists();
                takeButton.disabled = true;
                return;
            }

            // Mode classique vidéo / audio / data
            const srcId = selectedSourceId;
            const dstId = selectedDestId;

            if (!isProfileCompatible(srcId, dstId)) {
                alert(t("panel_err_profile_refused_alert"));
                return;
            }

            takeButton.disabled = true;
            takeButton.textContent = t("panel_take_in_progress");

            try {
                logStatus(t("panel_status_switching", { src: srcId, dst: dstId }));

                const r = await fetch("api_switch.php", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sender_id: srcId, receiver_id: dstId })
                });

                const res = await r.json();
                if (!res.ok) throw new Error(res.error || "switch failed");

                activeConnections[dstId] = srcId;

                logStatus(t("panel_status_switch_ok", { src: srcId, dst: dstId }));
            } catch (e) {
                console.error(e);
                alert(t("panel_err_switch_failed_alert") + e.message);
                logStatus(t("panel_status_error_prefix") + e.message);
            } finally {
                takeButton.textContent = t("panel_take_btn");
                renderLists();
                takeButton.disabled = true;
            }
        }









        // ====== Suggestions de TAGS / CATÉGORIES pour l'autocomplete ======

        function extractTagsFrom(item) {
            let tags = [];

            if (Array.isArray(item.tags)) {
                tags = item.tags;
            } else if (typeof item.tags === "string") {
                // au cas où un jour on ait "plateau1 / cameras"
                tags = item.tags.split(/[\/,]/);
            }

            return tags
                .map(t => t.trim())
                .filter(t => t.length > 0);
        }

        function updateGroupSuggestions() {
            const srcSet = new Set();
            const dstSet = new Set();

            if (currentMediaType === "virtual") {
                // --- Mode VIRTUAL : on utilise les TAGS des sources/destinations virtuelles ---
                sources.forEach(s => {
                    if (s.isVirtual && s.tags) {
                        extractTagsFrom(s).forEach(t => srcSet.add(t));
                    }
                });

                destinations.forEach(d => {
                    if (d.isVirtual && d.tags) {
                        extractTagsFrom(d).forEach(t => dstSet.add(t));
                    }
                });
            } else {
                // --- Mode VIDEO / AUDIO / DATA : on utilise les CATEGORY des labs ---
                sendersLabsData.forEach(x => {
                    if (x.category) srcSet.add(String(x.category).trim());
                });
                receiversLabsData.forEach(x => {
                    if (x.category) dstSet.add(String(x.category).trim());
                });
            }

            availableSrcGroups = Array.from(srcSet)
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }));
            availableDstGroups = Array.from(dstSet)
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }));

            renderTagBadges(srcGroupBadges, selectedSrcTags, (tag) => {
                selectedSrcTags = selectedSrcTags.filter(t => t !== tag);
                updateGroupSuggestions();
                renderLists();
            });
            renderTagBadges(dstGroupBadges, selectedDstTags, (tag) => {
                selectedDstTags = selectedDstTags.filter(t => t !== tag);
                updateGroupSuggestions();
                renderLists();
            });
        }

        function renderTagBadges(container, selectedList, onRemove) {
            container.innerHTML = "";
            selectedList.forEach(tag => {
                const badge = document.createElement("span");
                badge.className = "tag-badge";
                const textSpan = document.createElement("span");
                textSpan.textContent = tag;
                const closeSpan = document.createElement("span");
                closeSpan.className = "tag-badge-remove";
                closeSpan.textContent = "×";
                closeSpan.onclick = (e) => {
                    e.stopPropagation();
                    onRemove(tag);
                };
                badge.appendChild(textSpan);
                badge.appendChild(closeSpan);
                container.appendChild(badge);
            });
        }

        function setupTagPicker(config) {
            const wrapper = document.getElementById(config.wrapperId);
            const input = config.inputEl;
            const dropdown = config.dropdownEl;

            function showDropdown() {
                const term = input.value.trim().toLowerCase();
                const selected = config.getSelected();
                const candidates = config.getAvailable().filter(g =>
                    !selected.includes(g) && (!term || g.toLowerCase().includes(term))
                );

                dropdown.innerHTML = "";
                if (candidates.length === 0) {
                    dropdown.style.display = "none";
                    return;
                }

                candidates.forEach(g => {
                    const item = document.createElement("div");
                    item.className = "tag-dropdown-item";
                    item.textContent = g;
                    item.onclick = (e) => {
                        e.stopPropagation();
                        const next = config.getSelected().slice();
                        if (!next.includes(g)) next.push(g);
                        config.setSelected(next);
                        input.value = "";
                        dropdown.style.display = "none";
                        updateGroupSuggestions();
                        renderLists();
                    };
                    dropdown.appendChild(item);
                });

                dropdown.style.display = "block";
            }

            input.addEventListener("focus", showDropdown);
            input.addEventListener("input", () => {
                showDropdown();
                renderLists();
            });
            input.addEventListener("keydown", (e) => {
                if (e.key === "Backspace" && input.value === "") {
                    const current = config.getSelected();
                    if (current.length > 0) {
                        config.setSelected(current.slice(0, -1));
                        updateGroupSuggestions();
                        renderLists();
                        showDropdown();
                    }
                } else if (e.key === "Enter") {
                    const term = input.value.trim().toLowerCase();
                    if (!term) return;
                    const selected = config.getSelected();
                    const match = config.getAvailable().find(g =>
                        !selected.includes(g) && g.toLowerCase().includes(term)
                    );
                    if (match) {
                        e.preventDefault();
                        config.setSelected(selected.concat([match]));
                        input.value = "";
                        dropdown.style.display = "none";
                        updateGroupSuggestions();
                        renderLists();
                    }
                } else if (e.key === "Escape") {
                    dropdown.style.display = "none";
                }
            });

            document.addEventListener("click", (e) => {
                if (wrapper && !wrapper.contains(e.target)) {
                    dropdown.style.display = "none";
                }
            });
        }













        async function initPanel() {
            try {
                logStatus(t("panel_status_loading"));

                const [
                    senders,
                    receivers,
                    nodesEnriched,
                    configNodes,
                    virtualSourcesJson,
                    virtualDestinationsJson
                ] = await Promise.all([
                    loadJson("./JSON_senders.json"),
                    loadJson("./JSON_receivers.json"),
                    loadJson("./JSON_nodes_enriched.json"),
                    loadJson("./config.nodes.json"),
                    loadJson("./JSON_virtual_sources.json"),
                    loadJson("./JSON_virtual_destinations.json")
                ]);

                const nodeNameByApi = {};
                configNodes.forEach(n => {
                    if (n.node_api && n.node_name) {
                        nodeNameByApi[n.node_api] = n.node_name;
                    }
                });

                nodeNameById = {};
                nodesEnriched.forEach(n => {
                    const nameFromConfig = nodeNameByApi[n.node_api];

                    const name = nameFromConfig || n.node_name || n.label || "";

                    nodeNameById[n.id] = name;
                });

                const allSenders = senders.map(s => ({
                    id: s.id,
                    label: s.label,
                    custom_label: s.custom_label || null,
                    display_label: s.custom_label || s.label || s.id,
                    equipement: s.equipement || "",
                    mediatype: (s.mediatype || "video").toLowerCase(),
                    device_id: s.device_id || null,
                    device_label: s.device_label || "",
                    node_id: s.node_id || null
                }));

                allSendersById = {};
                allSenders.forEach(s => { allSendersById[s.id] = s; });

                let customSources = allSenders.filter(s => !!s.custom_label);
                customSources.forEach(s => { s.display_label = s.custom_label; });

                const allReceivers = receivers.map(d => ({
                    id: d.id,
                    label: d.label,
                    custom_label: d.custom_label || null,
                    display_label: d.custom_label || d.label || d.id,
                    equipement: d.equipement || "",
                    mediatype: (d.mediatype || "video").toLowerCase(),
                    device_id: d.device_id || null,
                    device_label: d.device_label || "",
                    node_id: d.node_id || null,
                    subscription_active: d.subscription_active || false,
                    subscription_sender_id: d.subscription_sender_id || null
                }));

                let customDestinations = allReceivers.filter(d => !!d.custom_label);
                customDestinations.forEach(d => { d.display_label = d.custom_label; });

                activeConnections = {};
                allReceivers.forEach(d => {
                    if (d.subscription_active && d.subscription_sender_id) {
                        activeConnections[d.id] = d.subscription_sender_id;
                    }
                });

                // VIRTUAL SOURCES / DESTINATIONS
                virtualSources = virtualSourcesJson.map(vs => ({
                    id: vs.id,
                    label: vs.label,
                    custom_label: vs.label,
                    display_label: vs.label,
                    equipement: "",
                    mediatype: "virtual",
                    device_id: null,
                    device_label: "",
                    node_id: null,
                    isVirtual: true,
                    tags: vs.tags || [],
                    video_sender: vs.video_sender || null,
                    audio_sender: vs.audio_sender || null,
                    data_sender: vs.data_sender || null
                }));

                virtualDestinations = virtualDestinationsJson.map(vd => ({
                    id: vd.id,
                    label: vd.label,
                    custom_label: vd.label,
                    display_label: vd.label,
                    equipement: "",
                    mediatype: "virtual",
                    device_id: null,
                    device_label: "",
                    node_id: null,
                    isVirtual: true,
                    tags: vd.tags || [],
                    video_receiver: vd.video_receiver || null,
                    audio_receiver: vd.audio_receiver || null,
                    data_receiver: vd.data_receiver || null,
                    virtual_sender_id: vd.virtual_sender_id || null
                }));

                // SÉLECTION FINALE POUR LES LISTES
                sources = customSources.concat(virtualSources);
                destinations = customDestinations.concat(virtualDestinations);








                try {
                    const sendersLabs = await loadJson("./JSON_senders_labs.json");
                    sendersLabsData = sendersLabs;          // on garde le tableau complet
                    labsSenders = new Set(sendersLabs.map(x => x.id));
                    senderProfiles = {};

                    const senderCategoryById = {};
                    sendersLabs.forEach(x => {
                        if (x.profile_id) {
                            senderProfiles[x.id] = x.profile_id;
                        }
                        if (x.category) {
                            senderCategoryById[x.id] = String(x.category).trim();
                        }
                    });

                    // On pousse la category sur les sources custom
                    sources.forEach(s => {
                        if (senderCategoryById[s.id]) {
                            s.category = senderCategoryById[s.id];
                        }
                    });
                } catch (e) {
                    sendersLabsData = [];
                    labsSenders = new Set();
                    senderProfiles = {};
                }

                try {
                    const receiversLabs = await loadJson("./JSON_receivers_labs.json");
                    receiversLabsData = receiversLabs;      // on garde le tableau complet
                    labsReceivers = new Set(receiversLabs.map(x => x.id));
                    receiverProfilesAllowed = {};

                    const receiverCategoryById = {};
                    receiversLabs.forEach(x => {
                        if (typeof x.profiles_allowed !== "undefined") {
                            receiverProfilesAllowed[x.id] = x.profiles_allowed;
                        }
                        if (x.category) {
                            receiverCategoryById[x.id] = String(x.category).trim();
                        }
                    });

                    // On pousse la category sur les destinations custom
                    destinations.forEach(d => {
                        if (receiverCategoryById[d.id]) {
                            d.category = receiverCategoryById[d.id];
                        }
                    });
                } catch (e) {
                    receiversLabsData = [];
                    labsReceivers = new Set();
                    receiverProfilesAllowed = {};
                }

                // Maintenant qu'on a tout : suggestions + affichage
                updateGroupSuggestions();

                logStatus(t("panel_status_ready", {
                    src: sources.length,
                    dst: destinations.length,
                    conn: Object.keys(activeConnections).length
                }));

                renderLists();

            } catch (e) {
                console.error(e);
                alert(t("panel_err_load_alert") + e.message);
                logStatus(t("panel_status_error_prefix") + e.message);
            }
        }

        setupTagPicker({
            wrapperId: "srcTagPicker",
            inputEl: srcGroupInput,
            dropdownEl: srcGroupDropdown,
            getAvailable: () => availableSrcGroups,
            getSelected: () => selectedSrcTags,
            setSelected: (val) => { selectedSrcTags = val; }
        });

        setupTagPicker({
            wrapperId: "dstTagPicker",
            inputEl: dstGroupInput,
            dropdownEl: dstGroupDropdown,
            getAvailable: () => availableDstGroups,
            getSelected: () => selectedDstTags,
            setSelected: (val) => { selectedDstTags = val; }
        });

        srcSearchInput.addEventListener("input", renderLists);
        dstSearchInput.addEventListener("input", renderLists);
        takeButton.addEventListener("click", doTake);

        mediaToolbar.addEventListener("click", (e) => {
            const btn = e.target.closest(".media-btn");
            if (!btn) return;
            currentMediaType = btn.dataset.type;

            document.querySelectorAll(".media-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            selectedSourceId = null;
            selectedDestId = null;
            selectedSrcTags = [];
            selectedDstTags = [];
            srcGroupInput.value = "";
            dstGroupInput.value = "";

            // suggestions adaptées au type (virtual vs vidéo/audio/data)
            updateGroupSuggestions();

            renderLists();
        });

        document.addEventListener("DOMContentLoaded", async () => {
            await initI18n({ url: "i18n.json", selectId: "langSelect" });
            window.addEventListener("i18n:changed", () => {
                renderLists();
                if (sources.length || destinations.length) {
                    logStatus(t("panel_status_ready", {
                        src: sources.length,
                        dst: destinations.length,
                        conn: Object.keys(activeConnections).length
                    }));
                }
            });
            await initPanel();
        });

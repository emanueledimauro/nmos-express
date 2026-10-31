/**
 * NMOS Express - Nodes Configuration Controller (nodes.html)
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

let nodesData = [];
        let currentCheckRunId = 0;

        async function loadNodes() {
            try {
                // Cache busting added
                const response = await fetch('api_nodes.php?t=' + new Date().getTime());
                if (!response.ok) throw new Error(t("nodes_network_error"));
                nodesData = await response.json();
                console.log("Loaded nodes:", nodesData);
                renderTable();
                checkAllNodesStatus();
            } catch (e) {
                console.error(e);
                alert(t("nodes_load_error"));
            }
        }

        function getStatusDotClass(status) {
            if (status === 'ok') return 'bg-green-500';
            if (status === 'ko') return 'bg-red-500';
            return 'bg-gray-400';
        }

        function renderTable() {
            const tbody = document.getElementById('nodesTableBody');
            tbody.innerHTML = '';

            nodesData.forEach((node, index) => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-gray-50 transition-colors";
                const dotClass = getStatusDotClass(node._status);
                tr.innerHTML = `
                    <td class="p-3 text-center">
                        <span id="nodeStatusDot_${index}" class="inline-block w-3 h-3 rounded-full ${dotClass} transition-colors duration-200"></span>
                    </td>
                    <td class="p-3">
                        <input type="text" value="${node.node_name}" 
                            oninput="updateNode(${index}, 'node_name', this.value)"
                            class="mini-input" placeholder="${t('nodes_placeholder_name')}" data-i18n-placeholder="nodes_placeholder_name">
                    </td>
                    <td class="p-3">
                        <input type="text" value="${node.node_api}" 
                            oninput="updateNode(${index}, 'node_api', this.value)"
                            class="mini-input" placeholder="${t('nodes_placeholder_url')}" data-i18n-placeholder="nodes_placeholder_url">
                    </td>
                    <td class="p-3 text-right">
                        <div class="inline-flex items-center justify-end gap-1">
                            <button id="nodeUpdateBtn_${index}" onclick="updateSingleNode(${index})" 
                                class="text-blue-600 hover:text-blue-800 p-2 rounded hover:bg-blue-50 transition-colors ${node._status === 'ok' ? '' : 'hidden'}"
                                title="${t('nodes_update_node_title')}" data-i18n-title="nodes_update_node_title">
                                <i id="nodeUpdateIcon_${index}" class="fas fa-sync-alt"></i>
                            </button>
                            <button onclick="removeNode(${index})" class="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 transition-colors" 
                                title="${t('nodes_delete_title')}" data-i18n-title="nodes_delete_title">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        async function checkAllNodesStatus(resetFirst = false) {
            const runId = ++currentCheckRunId;
            const icon = document.getElementById('refreshStatusIcon');
            if (icon) icon.classList.add('fa-spin');

            if (resetFirst) {
                for (let i = 0; i < nodesData.length; i++) {
                    nodesData[i]._status = 'pending';
                    const dot = document.getElementById(`nodeStatusDot_${i}`);
                    if (dot) {
                        dot.className = `inline-block w-3 h-3 rounded-full ${getStatusDotClass('pending')} transition-colors duration-200`;
                    }
                    const updateBtn = document.getElementById(`nodeUpdateBtn_${i}`);
                    if (updateBtn) {
                        updateBtn.classList.add('hidden');
                    }
                }
            }

            try {
                for (let i = 0; i < nodesData.length; i++) {
                    if (runId !== currentCheckRunId) return;

                    const node = nodesData[i];
                    let isOk = false;

                    if (node && node.node_api) {
                        try {
                            const params = new URLSearchParams({ action: 'check_node', url: node.node_api });
                            const resp = await fetch('api_nodes.php?' + params.toString());
                            const data = await resp.json();
                            isOk = !!(resp.ok && data && data.reachable);
                            if (!isOk) {
                                console.warn("[NMOS] Nœud non joignable :", data);
                            }
                        } catch (e) {
                            console.warn("[NMOS] Erreur réseau :", e);
                            isOk = false;
                        }
                    }

                    if (runId !== currentCheckRunId) return;

                    nodesData[i]._status = isOk ? 'ok' : 'ko';
                    const dot = document.getElementById(`nodeStatusDot_${i}`);
                    if (dot) {
                        dot.className = `inline-block w-3 h-3 rounded-full ${getStatusDotClass(nodesData[i]._status)} transition-colors duration-200`;
                    }
                    const updateBtn = document.getElementById(`nodeUpdateBtn_${i}`);
                    if (updateBtn) {
                        if (nodesData[i]._status === 'ok') {
                            updateBtn.classList.remove('hidden');
                        } else {
                            updateBtn.classList.add('hidden');
                        }
                    }
                }
            } finally {
                if (runId === currentCheckRunId && icon) {
                    icon.classList.remove('fa-spin');
                }
            }
        }


        async function updateSingleNode(index) {
            const node = nodesData[index];
            if (!node || !node.node_api) return;

            const btn = document.getElementById(`nodeUpdateBtn_${index}`);
            const icon = document.getElementById(`nodeUpdateIcon_${index}`);

            if (btn) btn.disabled = true;
            if (icon) {
                icon.className = 'fas fa-sync-alt fa-spin text-blue-600';
            }

            try {
                const resp = await fetch('nmos-update.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        node_api: node.node_api,
                        node_name: node.node_name
                    })
                });

                const data = await resp.json().catch(() => null);

                if (!resp.ok || !data || !data.ok) {
                    const err = (data && data.error) ? data.error : ('HTTP ' + resp.status);
                    throw new Error(err);
                }

                if (icon) {
                    icon.className = 'fas fa-check text-green-600';
                }

                const sCount = data.senders_count ?? 0;
                const rCount = data.receivers_count ?? 0;
                const name = node.node_name || 'Node';

                showToast(t('nodes_update_success', { name, senders: sCount, receivers: rCount }));

                setTimeout(() => {
                    if (icon) icon.className = 'fas fa-sync-alt text-blue-600';
                    if (btn) btn.disabled = false;
                }, 2000);

            } catch (e) {
                console.error("Update node error:", e);
                if (icon) icon.className = 'fas fa-exclamation-triangle text-red-600';
                const name = node.node_name || 'Node';
                alert((t('nodes_update_error', { name }) || "Erreur lors de la mise à jour : ") + e.message);
                setTimeout(() => {
                    if (icon) icon.className = 'fas fa-sync-alt text-blue-600';
                    if (btn) btn.disabled = false;
                }, 2000);
            }
        }

        function showToast(message, isError = false) {
            const container = document.getElementById('toastContainer');
            if (!container) return;
            const toast = document.createElement('div');
            toast.className = `px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 transform transition-all duration-300 translate-y-2 opacity-0 pointer-events-auto ${isError ? 'bg-red-600 text-white' : 'bg-slate-900 text-white border border-slate-700'
                }`;
            toast.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-circle text-red-300' : 'fa-check-circle text-green-400'}"></i> <span>${message}</span>`;
            container.appendChild(toast);

            requestAnimationFrame(() => {
                toast.classList.remove('translate-y-2', 'opacity-0');
            });

            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-2');
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        }

        function addNodeRow() {
            nodesData.push({ node_name: "", node_api: "" });
            renderTable();
        }

        function openAddNodeModal() {
            document.getElementById('modalNodeName').value = '';
            document.getElementById('modalNodeIp').value = '';
            document.getElementById('modalNodePort').value = '';

            const sel = document.getElementById('modalNodeVersion');
            sel.innerHTML = `<option value="">${t('nodes_modal_version_placeholder')}</option>`;
            sel.disabled = true;

            document.getElementById('modalUrlPreview').value = '';
            document.getElementById('modalOkBtn').disabled = true;

            const statusEl = document.getElementById('modalDiscoverStatus');
            statusEl.className = 'text-xs hidden';
            statusEl.textContent = '';

            document.getElementById('addNodeModal').classList.remove('hidden');
            document.getElementById('modalNodeName').focus();
        }

        function closeAddNodeModal() {
            document.getElementById('addNodeModal').classList.add('hidden');
        }

        function getBaseNodeUrl(ip, port) {
            const cleanIp = ip.trim();
            const cleanPort = port.trim();
            if (!cleanIp) return '';
            return `http://${cleanIp}${cleanPort ? ':' + cleanPort : ''}/x-nmos/node/`;
        }

        function onIpPortInput() {
            // Reset version select and status while IP/port changes
            const sel = document.getElementById('modalNodeVersion');
            sel.innerHTML = `<option value="">${t('nodes_modal_version_placeholder')}</option>`;
            sel.disabled = true;

            const statusEl = document.getElementById('modalDiscoverStatus');
            statusEl.className = 'text-xs hidden';
            statusEl.textContent = '';

            updateModalPreview();
        }

        async function discoverNodeVersions() {
            const ip = document.getElementById('modalNodeIp').value.trim();
            const port = document.getElementById('modalNodePort').value.trim();
            const statusEl = document.getElementById('modalDiscoverStatus');
            const spinner = document.getElementById('discoverSpinner');
            const sel = document.getElementById('modalNodeVersion');

            if (!ip) return;

            const baseUrl = getBaseNodeUrl(ip, port);
            statusEl.className = 'text-xs text-blue-600 block';
            statusEl.textContent = t('nodes_modal_fetching', { url: baseUrl });
            spinner.classList.add('fa-spin');

            try {
                const params = new URLSearchParams({ action: 'discover_versions', ip, port });
                const resp = await fetch('api_nodes.php?' + params.toString());
                const data = await resp.json();

                if (!resp.ok || !data.ok || !Array.isArray(data.versions) || data.versions.length === 0) {
                    throw new Error(data.error || t('nodes_network_error'));
                }

                sel.innerHTML = '';
                data.versions.forEach(ver => {
                    const opt = document.createElement('option');
                    opt.value = ver;
                    opt.textContent = ver;
                    sel.appendChild(opt);
                });

                // Select highest version by default (e.g. "v1.3/")
                sel.value = data.versions[data.versions.length - 1];
                sel.disabled = false;

                statusEl.className = 'text-xs text-green-600 block';
                statusEl.textContent = t('nodes_modal_fetch_ok', { count: data.versions.length });
                updateModalPreview();
            } catch (e) {
                sel.innerHTML = `<option value="">${t('nodes_modal_version_placeholder')}</option>`;
                sel.disabled = true;
                statusEl.className = 'text-xs text-red-600 block';
                statusEl.textContent = t('nodes_modal_fetch_err', { error: e.message });
                updateModalPreview();
            } finally {
                spinner.classList.remove('fa-spin');
            }
        }

        function updateModalPreview() {
            const ip = document.getElementById('modalNodeIp').value.trim();
            const port = document.getElementById('modalNodePort').value.trim();
            const ver = document.getElementById('modalNodeVersion').value;
            const previewEl = document.getElementById('modalUrlPreview');
            const okBtn = document.getElementById('modalOkBtn');

            const base = getBaseNodeUrl(ip, port);
            if (base && ver) {
                previewEl.value = base + ver;
                okBtn.disabled = false;
            } else {
                previewEl.value = base;
                okBtn.disabled = true;
            }
        }

        async function confirmAddNode() {
            const name = document.getElementById('modalNodeName').value.trim();
            const fullUrl = document.getElementById('modalUrlPreview').value.trim();
            const ver = document.getElementById('modalNodeVersion').value;

            if (!name || !fullUrl || !ver) {
                alert(t('nodes_modal_missing_fields'));
                return;
            }

            nodesData.push({
                node_name: name,
                node_api: fullUrl
            });

            closeAddNodeModal();
            await saveNodes(true);
        }

        async function removeNode(index) {
            if (!await showModalConfirm(t("nodes_confirm_delete"))) return;
            nodesData.splice(index, 1);
            await saveNodes(true); // Save immediately to config.nodes.json
            showToast(t("nodes_deleted_toast"), false);
        }

        async function updateNmosDatabase() {
            const btn = document.getElementById('updateBaseBtn');
            const icon = document.getElementById('updateBaseIcon');
            const text = document.getElementById('updateBaseText');

            // 1. Validation de toutes les lignes
            for (let i = 0; i < nodesData.length; i++) {
                const node = nodesData[i];
                if (!node.node_name.trim()) {
                    alert(t("nodes_err_empty_name", { line: i + 1 }));
                    return;
                }
                if (!validateNodeUrl(node.node_api)) {
                    alert(t("nodes_err_invalid_url", { name: node.node_name, line: i + 1 }));
                    return;
                }
            }

            // Bouton en état d'attente
            if (btn && icon && text) {
                btn.disabled = true;
                btn.classList.add('opacity-60', 'cursor-not-allowed');
                icon.classList.add('fa-spin');
                text.textContent = t("nodes_update_base_in_progress");
            }

            try {
                // 2. Sauvegarde de la liste dans config.nodes.json
                const saveResp = await fetch('api_nodes.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nodesData)
                });
                if (!saveResp.ok) throw new Error(t("nodes_save_error_http"));

                // 3. Lancement de la mise à jour complète NMOS avec purge automatique des nœuds orphelins
                const updateResp = await fetch('nmos-update.php?t=' + Date.now());
                const res = await updateResp.json();

                if (res && res.ok) {
                    const okCount = res.nodes_ok ?? 0;
                    const koCount = res.nodes_ko ?? 0;
                    let msg = t("nodes_update_base_success") + ` (${okCount} OK`;
                    if (koCount > 0) msg += `, ${koCount} KO`;

                    // Détails des éléments purgés si présents
                    const p = res.purged;
                    if (p && (p.nodes > 0 || p.senders > 0 || p.receivers > 0)) {
                        const purgedDetails = [];
                        if (p.nodes > 0) purgedDetails.push(`${p.nodes} nœud(s)`);
                        if (p.senders > 0) purgedDetails.push(`${p.senders} source(s)`);
                        if (p.receivers > 0) purgedDetails.push(`${p.receivers} destination(s)`);
                        msg += ` - Purgé : ${purgedDetails.join(', ')}`;
                    }
                    msg += ')';

                    showToast(msg, false);

                    if (koCount > 0 && Array.isArray(res.errors)) {
                        res.errors.forEach(err => {
                            showToast(`${t("node_ko")} (${err.step}) : ${err.node_api} → ${err.error}`, true);
                        });
                    }
                } else {
                    showToast(res.error || t("unexpected_response"), true);
                }

                // 4. Recharger la liste et l'état des nœuds
                await loadNodes();

            } catch (err) {
                console.error("Erreur mise à jour base NMOS:", err);
                showToast(t("nodes_save_error") + err.message, true);
            } finally {
                if (btn && icon && text) {
                    btn.disabled = false;
                    btn.classList.remove('opacity-60', 'cursor-not-allowed');
                    icon.classList.remove('fa-spin');
                    text.textContent = t("nodes_update_base_btn");
                }
            }
        }

        function updateNode(index, field, value) {
            nodesData[index][field] = value;
        }

        function validateNodeUrl(urlString) {
            try {
                const url = new URL(urlString);

                // 1. Protocol
                if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

                // 2. Hostname (IP Strict Check)
                // If it looks like an IPv4 (digits and dots), verify octets
                if (/^(\d{1,3}\.){3}\d{1,3}$/.test(url.hostname)) {
                    const parts = url.hostname.split('.').map(Number);
                    for (const part of parts) {
                        if (part < 0 || part > 255) return false;
                    }
                }

                // 3. Path & Version
                // Must match /x-nmos/node/v1.0/ to v1.3/ strictly
                const pathRegex = /^\/x-nmos\/node\/v1\.[0-3]\/$/;
                return pathRegex.test(url.pathname);

            } catch (e) {
                return false; // Not a valid URL
            }
        }

        async function saveNodes(isDeletion = false) {
            // Validate all nodes before saving (skip if it's a deletion, though generally data should be valid)
            // Actually, even on deletion we verify consistency, but mainly on manual edits.
            if (!isDeletion) {
                for (let i = 0; i < nodesData.length; i++) {
                    const node = nodesData[i];
                    if (!node.node_name.trim()) {
                        alert(t("nodes_err_empty_name", { line: i + 1 }));
                        return;
                    }
                    if (!validateNodeUrl(node.node_api)) {
                        alert(t("nodes_err_invalid_url", { name: node.node_name, line: i + 1 }));
                        return;
                    }
                }
            }

            try {
                const response = await fetch('api_nodes.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nodesData)
                });

                if (!response.ok) throw new Error(t("nodes_save_error_http"));
                const res = await response.json();

                if (isDeletion) {
                    loadNodes();
                } else {
                    showToast(t("nodes_save_success"), "success");
                    loadNodes();
                }

            } catch (e) {
                console.error(e);
                alert(t("nodes_save_error") + e.message);
            }
        }

        // Initialize i18n then load nodes
        (async () => {
            await initI18n({ url: "i18n.json", selectId: "langSelect" });
            await loadNodes();
        })();

// Expose functions globally for inline HTML event handlers & dynamic templates
window.toggleMenu = toggleMenu;
window.loadNodes = loadNodes;
window.getStatusDotClass = getStatusDotClass;
window.renderTable = renderTable;
window.checkAllNodesStatus = checkAllNodesStatus;
window.updateSingleNode = updateSingleNode;
window.showToast = showToast;
window.addNodeRow = addNodeRow;
window.openAddNodeModal = openAddNodeModal;
window.closeAddNodeModal = closeAddNodeModal;
window.getBaseNodeUrl = getBaseNodeUrl;
window.onIpPortInput = onIpPortInput;
window.discoverNodeVersions = discoverNodeVersions;
window.updateModalPreview = updateModalPreview;
window.confirmAddNode = confirmAddNode;
window.removeNode = removeNode;
window.updateNmosDatabase = updateNmosDatabase;
window.updateNode = updateNode;
window.validateNodeUrl = validateNodeUrl;
window.saveNodes = saveNodes;

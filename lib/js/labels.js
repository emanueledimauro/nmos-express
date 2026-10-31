/**
 * NMOS Express - Labels Controller (labels.html)
 */

let currentType = "senders";
    let nodes = [];
    let devices = [];
    let items = [];
    let dirtyMap = {};

    // UI selection
    let expandedNodes = new Set();     // nodes expand/collapse
    let selectedNodeId = null;         // the node whose devices are visible (optional highlight)
    let selectedDeviceId = null;       // device filter for items

    // Filtre des éléments à personnaliser / personnalisés
    let baselineToCustomizeIds = new Set();
    let lastNavigationKey = null;

    function updateToCustomizeBaseline(force = false) {
      const currentKey = `${currentType}_${selectedNodeId || ''}_${selectedDeviceId || ''}`;
      if (force || currentKey !== lastNavigationKey) {
        lastNavigationKey = currentKey;
        baselineToCustomizeIds.clear();
        (items || []).forEach(it => {
          if (selectedDeviceId && it.device_id !== selectedDeviceId) return;
          if (selectedNodeId) {
            const d = devices.find(x => x.id === it.device_id);
            const itemNodeId = it.node_id || (d ? d.node_id : null);
            if (itemNodeId !== selectedNodeId) return;
          }
          const hasCustom = !!it.custom_label || !!it._label_custom;
          if (!hasCustom) {
            baselineToCustomizeIds.add(it.id);
          }
        });
      }
    }

    // Profils globaux (json/config.profiles.json)
    let profiles = [];

    const $ = sel => document.querySelector(sel);

    function setStatus(msg) { $("#status").textContent = msg || ""; }

    // ------------------- API -------------------

    async function apiLoad(type) {
      setStatus(t("labels_status_loading", { type }));
      const r = await fetch(`php/api_labels.php?action=load&type=${type}`, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }

    async function apiSave(type, payload) {
      const r = await fetch(`php/api_labels.php?action=bulk_save&type=${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }

    async function loadProfiles() {
      try {
        const r = await fetch("json/config.profiles.json", { cache: "no-store" });
        if (!r.ok) {
          console.warn("Impossible de charger json/config.profiles.json", r.status);
          profiles = [];
          return;
        }
        profiles = await r.json();
      } catch (e) {
        console.error("Erreur chargement profils", e);
        profiles = [];
      }
    }

    let knownCategories = new Set();

    async function loadCategories() {
      try {
        const [sLabs, rLabs] = await Promise.all([
          fetch("json/JSON_senders_labs.json", { cache: "no-store" }).then(r => r.json()).catch(() => []),
          fetch("json/JSON_receivers_labs.json", { cache: "no-store" }).then(r => r.json()).catch(() => [])
        ]);
        (sLabs || []).forEach(x => { if (x && x.category && String(x.category).trim() !== "") knownCategories.add(String(x.category).trim()); });
        (rLabs || []).forEach(x => { if (x && x.category && String(x.category).trim() !== "") knownCategories.add(String(x.category).trim()); });
      } catch (e) {
        console.warn("Could not load categories", e);
      }
      updateCategoryDatalist();
    }

    function updateCategoryDatalist() {
      let datalist = document.getElementById("categorySuggestions");
      if (!datalist) {
        datalist = document.createElement("datalist");
        datalist.id = "categorySuggestions";
        document.body.appendChild(datalist);
      }

      // Collect categories strictly from loaded items (saved in backend)
      (items || []).forEach(it => {
        if (it && it.category && String(it.category).trim() !== "") {
          knownCategories.add(String(it.category).trim());
        }
      });

      const sorted = Array.from(knownCategories).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

      datalist.innerHTML = "";
      sorted.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat;
        datalist.appendChild(opt);
      });
    }

    function normalize(str) { return (str || "").toLowerCase(); }

    // ------------------- Helpers Node/Device -------------------

    function getNodeIPs(node) {
      try {
        if (node && node.api && Array.isArray(node.api.endpoints) && node.api.endpoints.length) {
          const ips = node.api.endpoints.map(e => e.host).filter(Boolean);
          if (ips.length) return Array.from(new Set(ips));
        }

        if (node && Array.isArray(node.interfaces) && node.interfaces.length) {
          const ips = node.interfaces.map(i => i.ip || i.address || i.host).filter(Boolean);
          if (ips.length) return Array.from(new Set(ips));
        }

        if (node && typeof node.node_api === "string" && node.node_api.length) {
          try {
            const u = new URL(node.node_api);
            if (u.hostname) {
              const host = u.port ? `${u.hostname}:${u.port}` : u.hostname;
              return [host];
            }
          } catch (e) { }
        }

        if (node && typeof node.href === "string" && node.href.length) {
          try {
            const u = new URL(node.href);
            if (u.hostname) {
              const host = u.port ? `${u.hostname}:${u.port}` : u.hostname;
              return [host];
            }
          } catch (e) { }
        }
      } catch (e) { }

      return [];
    }

    function renderRecap(node, device) {
      const recapEl = document.getElementById("recap");
      if (!recapEl || !node) return;

      const nodeLabel = node.label || node.node_name || node.id || t("labels_node_no_label");
      const nodeDesc = node.description || "";
      const ips = getNodeIPs(node);

      let deviceSection = "";
      if (device) {
        const devLabel = device.label || device.id || t("labels_device_no_label");
        const devDesc = device.description || "";
        deviceSection = `
    <div class="recap-section">
      <div class="recap-title">${t("labels_selected_device")}</div>
      <div class="recap-line"><b>${devLabel}</b></div>
      ${devDesc ? `<div class="recap-line recap-desc">${devDesc}</div>` : ""}
    </div>`;
      }

      recapEl.innerHTML = `
    <div class="recap-section">
      <div class="recap-title">${t("labels_origin_node")}</div>
      <div class="recap-line"><b>${nodeLabel}</b></div>
      ${nodeDesc ? `<div class="recap-line recap-desc">${nodeDesc}</div>` : ""}
      <div class="recap-line">
        <span class="recap-key">IP :</span>
        ${ips.length ? ips.join(", ") : `<i>${t("labels_ip_not_provided")}</i>`}
      </div>
    </div>${deviceSection}
  `;
      recapEl.style.display = "flex";
    }

    function mediaBadge(mt) {
      mt = (mt || "unknown").toLowerCase();
      let cls = "mt mt-unknown";
      if (mt === "video") cls = "mt mt-video";
      else if (mt === "audio") cls = "mt mt-audio";
      else if (mt === "data") cls = "mt mt-data";
      return `<div style="text-align:center;"><span class="${cls}">${mt}</span></div>`;
    }

    // ------------------- Tree (nodes/devices) -------------------

    function renderTree() {
      const treeFilter = normalize($("#filterTree").value);
      const nodesDiv = $("#nodesList");
      const nodesHint = $("#nodesHint");

      nodesDiv.innerHTML = "";
      nodesHint.style.display = "none";

      // Élément racine : contexte global (tous les nodes / devices)
      const rootRow = document.createElement("div");
      rootRow.className = "node-row" + (!selectedNodeId && !selectedDeviceId ? " active" : "");
      rootRow.style.marginBottom = "6px";
      rootRow.style.borderBottom = "1px solid var(--border)";
      rootRow.style.borderRadius = "6px 6px 0 0";

      const rootIcon = document.createElement("div");
      rootIcon.className = "node-caret";
      rootIcon.innerHTML = '<i class="fas fa-sitemap"></i>';
      rootIcon.style.fontSize = "11px";
      rootRow.appendChild(rootIcon);

      const rootLabel = document.createElement("div");
      rootLabel.className = "node-label";
      rootLabel.textContent = t("labels_all_nodes");
      rootRow.appendChild(rootLabel);

      rootRow.onclick = () => {
        selectedNodeId = null;
        selectedDeviceId = null;
        renderTree();
        renderItems();
      };

      nodesDiv.appendChild(rootRow);

      let shownNodes = 0;

      nodes.forEach(n => {
        const nodeLabel = n.label || n.node_name || n.id;
        const nodeMatches = !treeFilter || normalize(nodeLabel).includes(treeFilter);

        const nodeDevices = devices.filter(d => d.node_id === n.id);
        const anyDeviceMatches = treeFilter && nodeDevices.some(dv => normalize(dv.label || dv.id).includes(treeFilter));

        if (treeFilter && !nodeMatches && !anyDeviceMatches) return;

        shownNodes++;

        const isExpanded = expandedNodes.has(n.id);
        const row = document.createElement("div");
        row.className = "node-row" + (selectedNodeId === n.id && !selectedDeviceId ? " active" : "");

        const caret = document.createElement("div");
        caret.className = "node-caret";
        caret.textContent = isExpanded ? "▼" : "▶";
        caret.style.fontSize = "10px";
        row.appendChild(caret);

        const labelDiv = document.createElement("div");
        labelDiv.className = "node-label";
        labelDiv.textContent = nodeLabel;
        row.appendChild(labelDiv);

        row.onclick = () => {
          if (selectedNodeId === n.id && selectedDeviceId) {
            // Revenir du device au node parent sans replier la liste
            expandedNodes.add(n.id);
          } else {
            if (isExpanded) expandedNodes.delete(n.id);
            else expandedNodes.add(n.id);
          }

          selectedNodeId = n.id;
          selectedDeviceId = null;   // reset device filter when switching node
          renderTree();
          renderItems();
        };

        nodesDiv.appendChild(row);

        if (isExpanded) {
          const sub = document.createElement("div");
          sub.className = "devices-sublist";

          const devsToShow = nodeDevices
            .filter(dv => !treeFilter || normalize(dv.label || dv.id).includes(treeFilter));

          if (devsToShow.length === 0) {
            const hint = document.createElement("div");
            hint.className = "devices-hint";
            hint.textContent = t("labels_no_device_match");
            sub.appendChild(hint);
          } else {
            devsToShow.forEach(dv => {
              const drow = document.createElement("div");
              drow.className = "device-row" + (selectedDeviceId === dv.id ? " active" : "");
              drow.textContent = dv.label || dv.id;
              drow.onclick = (ev) => {
                ev.stopPropagation();
                selectedNodeId = n.id;
                selectedDeviceId = (selectedDeviceId === dv.id ? null : dv.id);
                renderTree();
                renderItems();
              };
              sub.appendChild(drow);
            });
          }

          nodesDiv.appendChild(sub);
        }
      });

      if (shownNodes === 0) {
        nodesHint.style.display = "block";
      }
    }

    // ------------------- Profils helpers -------------------

    function getProfilesForType(type) {
      if (!type) return [];
      const t = type.toLowerCase();
      return profiles.filter(p => (p.type || "").toLowerCase() === t);
    }

    // ------------------- Profile Picker (badges + autocomplete) -------------------

    function renderProfilePicker(it, tdProf, inp) {
      const allProfilesObjs = getProfilesForType(it.mediatype);
      const allProfiles = allProfilesObjs.map(p => p.id);

      if (allProfiles.length === 0) {
        const span = document.createElement("span");
        span.className = "profile-picker-placeholder";
        span.textContent = t("labels_no_profiles_for_type");
        tdProf.appendChild(span);
        return;
      }

      const allowed = it.profiles_allowed;
      const isAll = (allowed === "*" || allowed === null || allowed === undefined);

      // 👉 Nouveau comportement :
      //    - si "*" ou rien -> selected = [] => on affiche juste "Pas de filtre"
      //    - si array non vide -> vrais badges
      let selected;
      if (isAll) {
        selected = [];                        // visuellement : pas de badge
      } else if (Array.isArray(allowed) && allowed.length > 0) {
        selected = allowed.slice();           // profils filtrés
      } else {
        selected = [];                        // fallback -> pas de filtre
      }

      const wrap = document.createElement("div");
      wrap.className = "profile-picker";

      const badges = document.createElement("div");
      badges.className = "profile-badges";

      const input = document.createElement("input");
      input.className = "profile-input";
      input.placeholder = t("labels_add_profile_placeholder");

      const sugg = document.createElement("div");
      sugg.className = "profile-suggestions";

      wrap.appendChild(badges);
      wrap.appendChild(input);
      wrap.appendChild(sugg);
      tdProf.appendChild(wrap);

      function applyDirty() {
        let profilesAllowed;
        // 👉 Sémantique conservée :
        //    - 0 sélection  -> "*"
        //    - toutes       -> "*"
        //    - sous-ensemble -> array
        if (selected.length === 0 || selected.length === allProfiles.length) {
          profilesAllowed = "*";
        } else {
          profilesAllowed = selected.slice();
        }

        const existing = dirtyMap[it.id] || {};
        const labelValue = (existing.label !== undefined) ? existing.label : (inp.value || "");
        dirtyMap[it.id] = Object.assign({}, existing, {
          label: labelValue,
          profiles_allowed: profilesAllowed
        });
        $("#saveAll").disabled = Object.keys(dirtyMap).length === 0;
      }

      function refreshBadges() {
        badges.innerHTML = "";
        if (selected.length === 0) {
          // 👉 Cas "*" ou aucun filtre explicite
          const placeholder = document.createElement("span");
          placeholder.className = "profile-picker-placeholder";
          placeholder.textContent = t("labels_no_profile_filter");
          badges.appendChild(placeholder);
          return;
        }
        selected.forEach(val => {
          const badge = document.createElement("div");
          badge.className = "profile-badge";
          badge.textContent = val;

          const x = document.createElement("span");
          x.textContent = "×";
          x.className = "remove";
          x.onclick = (ev) => {
            ev.stopPropagation();
            selected = selected.filter(s => s !== val);
            applyDirty();
            refreshBadges();
          };

          badge.appendChild(x);
          badges.appendChild(badge);
        });
      }

      function showSuggestions(filter) {
        const f = filter.toLowerCase();
        const list = allProfiles.filter(
          p => !selected.includes(p) && p.toLowerCase().includes(f)
        );

        if (list.length === 0) {
          sugg.style.display = "none";
          return;
        }

        sugg.innerHTML = "";
        list.forEach(p => {
          const s = document.createElement("div");
          s.className = "profile-suggestion";
          s.textContent = p;
          s.onclick = (ev) => {
            ev.stopPropagation();
            selected.push(p);
            sugg.style.display = "none";
            input.value = "";
            applyDirty();
            refreshBadges();
          };
          sugg.appendChild(s);
        });

        sugg.style.display = "block";
      }

      input.oninput = () => {
        const val = input.value.trim();
        if (!val) {
          sugg.style.display = "none";
          return;
        }
        showSuggestions(val);
      };

      input.onfocus = () => {
        const val = input.value.trim();
        if (val) showSuggestions(val);
      };

      document.addEventListener("click", (e) => {
        if (!wrap.contains(e.target)) {
          sugg.style.display = "none";
        }
      });

      // initial paint
      refreshBadges();
    }


    // ------------------- Table / Items -------------------

    function renderItems() {
      const tbody = $("#itemsTbody");
      tbody.innerHTML = "";

      const recapEl = document.getElementById("recap");
      if (recapEl) recapEl.style.display = "none";

      const filterCustomState = $("#filterCustomState") ? $("#filterCustomState").value : "all";
      const filterMedia = $("#filterMedia").value;
      const filter = normalize($("#filterItems").value).trim();

      updateToCustomizeBaseline(false);

      if (selectedDeviceId) {
        const selectedDevice = devices.find(d => d.id === selectedDeviceId);
        const selectedNode = selectedDevice ? nodes.find(n => n.id === selectedDevice.node_id) : null;
        if (selectedNode && selectedDevice) renderRecap(selectedNode, selectedDevice);
      } else if (selectedNodeId) {
        const selectedNode = nodes.find(n => n.id === selectedNodeId);
        if (selectedNode) renderRecap(selectedNode, null);
      }

      // Si à la racine (aucun node ni device sélectionné) et aucune recherche en cours
      if (!selectedNodeId && !selectedDeviceId && !filter) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 9;
        td.textContent = t("labels_select_device_prompt");
        td.style.color = "#6b7280";
        td.style.padding = "32px";
        td.style.textAlign = "center";
        td.style.fontStyle = "italic";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      const list = items.filter(it => {
        if (selectedDeviceId) {
          if (it.device_id !== selectedDeviceId) return false;
        } else if (selectedNodeId) {
          const d = devices.find(x => x.id === it.device_id);
          const itemNodeId = it.node_id || (d ? d.node_id : null);
          if (itemNodeId !== selectedNodeId) return false;
        }

        // Filtre selon l'état de personnalisation
        if (filterCustomState === "custom") {
          const hasCustom = !!it.custom_label || !!it._label_custom;
          if (!hasCustom) return false;
        } else if (filterCustomState === "to_customize") {
          if (!baselineToCustomizeIds.has(it.id)) return false;
        }

        if (filter) {
          const displayLabel = it.custom_label || it.label || "";
          const d = devices.find(x => x.id === it.device_id);
          const devLabel = d ? (d.label || d.id) : (it.device_label || "");
          const n = d ? nodes.find(x => x.id === d.node_id) : nodes.find(x => x.id === it.node_id);
          const nodeLabel = n ? (n.label || n.node_name || n.id) : "";
          const hay = [
            displayLabel,
            it.label,
            it.nmos_label,
            it.category,
            it.equipement,
            devLabel,
            nodeLabel
          ].map(normalize).join(" ");
          if (!hay.includes(filter)) return false;
        }

        if (filterMedia) {
          const mt = (it.mediatype || "unknown").toLowerCase();
          if (mt !== filterMedia) return false;
        }

        return true;
      });

      if (list.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 9;
        td.textContent = t("labels_no_results");
        td.style.color = "#6b7280";
        td.style.padding = "24px";
        td.style.textAlign = "center";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      // rendu normal
      list.forEach(it => {
        const tr = document.createElement("tr");

        const displayLabel = it.custom_label || it.label || "";
        const hasCustom = !!it.custom_label || !!it._label_custom;

        // Label actuel
        const tdOld = document.createElement("td");
        tdOld.innerHTML = `<span class="${hasCustom ? "custom" : ""}">${displayLabel}</span>`
          + (hasCustom ? `<span class="badge">custom</span>` : "");
        tr.appendChild(tdOld);

        // Label NMOS
        const tdNmos = document.createElement("td");
        tdNmos.textContent = it.nmos_label || it.label || "";
        tdNmos.style.color = "#6b7280";
        tr.appendChild(tdNmos);

        // Nouveau Label + Catégorie
        const tdNew = document.createElement("td");
        const inp = document.createElement("input");
        inp.className = "label-edit";
        inp.placeholder = t("labels_custom_placeholder");

        const dirty = dirtyMap[it.id] || {};
        const initialLabel = (dirty.label !== undefined)
          ? dirty.label
          : (it.custom_label || "");

        // catégorie éventuelle venant du backend (it.category)
        const initialCategory = (dirty.category !== undefined)
          ? dirty.category
          : (it.category || "");

        inp.value = initialLabel;
        tdNew.appendChild(inp);
        tr.appendChild(tdNew);

        // colonne Catégorie
        const tdCat = document.createElement("td");
        const catInput = document.createElement("input");
        catInput.className = "label-edit";
        catInput.setAttribute("list", "categorySuggestions");
        catInput.setAttribute("autocomplete", "off");
        catInput.placeholder = t("labels_category_placeholder");
        catInput.value = initialCategory;

        // Ouvrir la liste au clic
        catInput.addEventListener("click", () => {
          try { catInput.showPicker(); } catch (e) { }
        });

        tdCat.appendChild(catInput);
        tr.appendChild(tdCat);

        function updateDirty() {
          const existing = dirtyMap[it.id] || {};
          dirtyMap[it.id] = Object.assign({}, existing, {
            label: inp.value,
            category: catInput.value
          });
          $("#saveAll").disabled = Object.keys(dirtyMap).length === 0;
        }

        inp.oninput = updateDirty;
        catInput.oninput = updateDirty;

        // Type (badge)
        const tdMt = document.createElement("td");

        tdMt.innerHTML = mediaBadge(it.mediatype);
        tr.appendChild(tdMt);

        // Profils
        const tdProf = document.createElement("td");

        if (currentType === "receivers") {
          renderProfilePicker(it, tdProf, inp);
        } else {
          // Tab "Senders" : profil calculé (read-only) si présent
          if (it.profile_id) {
            tdProf.textContent = it.profile_id;
            tdProf.style.fontSize = "11px";
            tdProf.style.color = "#6b7280";
          } else {
            tdProf.textContent = "";
          }
        }

        tr.appendChild(tdProf);

        // Équipement
        const tdEq = document.createElement("td");
        tdEq.textContent = it.equipement || "";
        tr.appendChild(tdEq);

        // Device
        const tdDev = document.createElement("td");
        const d = devices.find(x => x.id === it.device_id);
        tdDev.textContent = d ? (d.label || d.id) : (it.device_id || "");
        tdDev.style.fontSize = "11px";
        tdDev.style.color = "#6b7280";
        tr.appendChild(tdDev);

        // Action
        const tdAct = document.createElement("td");
        tdAct.className = "row-actions";
        tdAct.style.textAlign = "right";
        const btn = document.createElement("button");
        btn.className = "save";
        btn.textContent = t("labels_btn_save_row");
        btn.onclick = async () => {
          const dirty = dirtyMap[it.id] || {};
          const payload = {
            id: it.id,
            label: (dirty.label !== undefined) ? dirty.label : inp.value,
            category: (dirty.category !== undefined) ? dirty.category : catInput.value
          };
          if (currentType === "receivers" && dirty.profiles_allowed !== undefined) {
            payload.profiles_allowed = dirty.profiles_allowed;
          }
          await saveMany([payload]);
          delete dirtyMap[it.id];
          $("#saveAll").disabled = Object.keys(dirtyMap).length === 0;
          await refresh();
        };
        tdAct.appendChild(btn);

        // Bouton Libérer (seulement si custom)
        if (hasCustom) {
          const btnFree = document.createElement("button");
          btnFree.className = "save";
          btnFree.textContent = t("labels_btn_free");
          btnFree.style.marginLeft = "6px";
          btnFree.onclick = async () => {
            if (!await showModalConfirm(t("labels_confirm_free"))) return;
            await saveMany([{ id: it.id, label: "" }]);
            delete dirtyMap[it.id];
            $("#saveAll").disabled = Object.keys(dirtyMap).length === 0;
            await refresh();
          };
          tdAct.appendChild(btnFree);
        }

        tr.appendChild(tdAct);

        tbody.appendChild(tr);
      });
    }

    async function saveMany(arr) {
      setStatus(t("labels_status_saving"));
      const res = await apiSave(currentType, { items: arr });
      if (!res.ok) throw new Error("Save failed");

      // Add newly saved categories to knownCategories only after confirmation
      (arr || []).forEach(item => {
        if (item && item.category && String(item.category).trim() !== "") {
          knownCategories.add(String(item.category).trim());
        }
      });
      updateCategoryDatalist();

      setStatus(t("labels_status_saved"));
      setTimeout(() => setStatus(""), 1200);
    }

    // ------------------- Refresh -------------------

    async function refresh() {
      const data = await apiLoad(currentType);
      nodes = data.nodes || [];
      devices = data.devices || [];

      const labsArr = data.labs || [];
      const labsMap = {};
      labsArr.forEach(l => {
        if (l && l.id) labsMap[l.id] = l;
      });

      items = (data[currentType] || []).map(it => {
        const custom = it.custom_label || it._label_custom || null;
        const nmos = it.nmos_label || it.label_nmos || it.label || null;
        const lab = labsMap[it.id] || {};
        return Object.assign({}, it, {
          custom_label: custom,
          nmos_label: nmos,
          profile_id: lab.profile_id || null,
          profiles_allowed: (lab.profiles_allowed !== undefined ? lab.profiles_allowed : null),
          category: (lab.category !== undefined ? lab.category : (it.category || ""))
        });
      });

      const nodeIds = new Set(nodes.map(n => n.id));
      expandedNodes = new Set(Array.from(expandedNodes).filter(id => nodeIds.has(id)));
      if (selectedNodeId && !nodeIds.has(selectedNodeId)) selectedNodeId = null;

      const devIds = new Set(devices.map(d => d.id));
      if (selectedDeviceId && !devIds.has(selectedDeviceId)) selectedDeviceId = null;

      setStatus("");
      updateCategoryDatalist();
      renderTree();
      renderItems();
    }

    // ------------------- Tabs & Events -------------------

    function setTab(type) {
      currentType = type;
      lastNavigationKey = null;
      $("#tabSenders").classList.toggle("active", type === "senders");
      $("#tabReceivers").classList.toggle("active", type === "receivers");
      dirtyMap = {};
      $("#saveAll").disabled = true;
      refresh();
    }

    $("#tabSenders").onclick = () => setTab("senders");
    $("#tabReceivers").onclick = () => setTab("receivers");
    $("#filterTree").oninput = () => renderTree();
    $("#filterItems").oninput = () => renderItems();
    $("#filterCustomState").onchange = () => {
      updateToCustomizeBaseline(true);
      renderItems();
    };
    $("#filterMedia").onchange = () => renderItems();
    $("#saveAll").onclick = async () => {
      const arr = Object.keys(dirtyMap).map(id => {
        const d = dirtyMap[id] || {};
        const payload = { id: id };
        if (d.label !== undefined) payload.label = d.label;
        if (d.category !== undefined) payload.category = d.category;
        if (currentType === "receivers" && d.profiles_allowed !== undefined) {
          payload.profiles_allowed = d.profiles_allowed;
        }
        return payload;
      });
      if (arr.length === 0) return;
      await saveMany(arr);
      dirtyMap = {};
      $("#saveAll").disabled = true;
      await refresh();
    };

    window.addEventListener("i18n:changed", () => {
      renderTree();
      renderItems();
    });

    // ------------------- Boot -------------------

    (async function init() {
      await initI18n({ url: "json/i18n.json", selectId: "langSelect" });
      await loadProfiles();
      await loadCategories();
      setTab("senders");
    })();

    // Hamburger Menu Logic
    function toggleMenu() {
      const menu = document.getElementById('dropdownMenu');
      menu.classList.toggle('hidden');
    }

    // Close menu when clicking outside
    document.addEventListener('click', function (event) {
      const menu = document.getElementById('dropdownMenu');
      const btn = document.getElementById('menuBtn');
      if (menu && !menu.contains(event.target) && btn && !btn.contains(event.target)) {
        menu.classList.add('hidden');
      }
    });


// Expose functions globally for inline HTML event handlers
window.toggleMenu = toggleMenu;

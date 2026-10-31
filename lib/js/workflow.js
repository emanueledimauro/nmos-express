/**
 * NMOS Express - Workflow Controller (workflow.html)
 */

// -----------------------------
    // Menu (copié du template)
    // -----------------------------
    function toggleMenu() {
      const menu = document.getElementById('dropdownMenu');
      menu.classList.toggle('hidden');
    }

    document.addEventListener('click', function (event) {
      const menu = document.getElementById('dropdownMenu');
      const btn = document.getElementById('menuBtn');
      if (menu && btn && !menu.contains(event.target) && !btn.contains(event.target)) {
        menu.classList.add('hidden');
      }
    });

    // -----------------------------
    // Toast minimal (indépendant)
    // -----------------------------
    function toast(type, title, message, details) {
      const host = document.getElementById("wf-toast");
      const el = document.createElement("div");
      el.className = `wf-toast-item ${type || "error"}`;
      if (details) el.title = JSON.stringify(details, null, 2);

      el.innerHTML = `
        <button class="close" aria-label="close">×</button>
        <div class="title">${title || "Info"}</div>
        <div class="text" style="font-size:12px; color:#e5e7eb;">${message || ""}</div>
      `;

      el.querySelector(".close").onclick = () => el.remove();

      // animation
      el.style.transform = "translateY(6px)";
      el.style.opacity = "0";
      requestAnimationFrame(() => {
        el.style.transition = "all 160ms ease-out";
        el.style.transform = "translateY(0)";
        el.style.opacity = "1";
      });

      host.prepend(el);
      setTimeout(() => {
        if (!el.isConnected) return;
        el.style.opacity = "0";
        el.style.transform = "translateY(6px)";
        setTimeout(() => el.remove(), 180);
      }, 3500);
    }

    // -----------------------------
    // API workflow (fallback localStorage si api absente)
    // -----------------------------
    const API_URL = "api_workflow.php";
    const LS_KEY = "easy-ipcontrol.workflows.v1";

    async function apiList() {
      try {
        const r = await fetch(`${API_URL}?action=list`, { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const data = await r.json();
        if (!data || !data.ok) throw new Error(data?.error || "bad response");
        return data.workflows || [];
      } catch (e) {
        // fallback localStorage
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : [];
      }
    }

    async function apiSave(workflow) {
      try {
        const r = await fetch(`${API_URL}?action=save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(workflow)
        });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || "save failed");
        return true;
      } catch (e) {
        // fallback localStorage
        const all = await apiList();
        const idx = all.findIndex(w => w.id === workflow.id);
        if (idx >= 0) all[idx] = workflow; else all.unshift(workflow);
        localStorage.setItem(LS_KEY, JSON.stringify(all, null, 2));
        return true;
      }
    }

    async function apiDelete(workflowId) {
      try {
        const r = await fetch(`${API_URL}?action=delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: workflowId })
        });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || "delete failed");
        return true;
      } catch (e) {
        // fallback localStorage
        const all = await apiList();
        const filtered = all.filter(w => w.id !== workflowId);
        localStorage.setItem(LS_KEY, JSON.stringify(filtered, null, 2));
        return true;
      }
    }

    // -----------------------------
    // Catalog (labs-only + media filter)
    // -----------------------------
    // Source opérateur = *_labs.json (labels personnalisés)
    // Source vérité technique = JSON_senders.json / JSON_receivers.json (mediatype)
    let catalogReady = false;
    let sendersFullById = new Map();
    let receiversFullById = new Map();
    let sendersLabsById = new Map();   // id -> {label, category, profile_id}
    let receiversLabsById = new Map(); // id -> {label, category, profiles_allowed}
    let labsSendersByMedia = { video: [], audio: [], data: [] };
    let labsReceiversByMedia = { video: [], audio: [], data: [] };

    async function loadJson(url) {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status + " sur " + url);
      return r.json();
    }

    function normMedia(x) {
      return String(x || "").toLowerCase().trim();
    }

    async function initCatalog() {
      try {
        const [senders, receivers, sLabs, rLabs] = await Promise.all([
          loadJson("JSON_senders.json"),
          loadJson("JSON_receivers.json"),
          loadJson("JSON_senders_labs.json"),
          loadJson("JSON_receivers_labs.json"),
        ]);

        sendersFullById = new Map((senders || []).map(s => [s.id, s]));
        receiversFullById = new Map((receivers || []).map(r => [r.id, r]));

        sendersLabsById = new Map((sLabs || []).map(x => [x.id, { label: x.label, category: x.category || "", profile_id: x.profile_id ?? null }]));
        receiversLabsById = new Map((rLabs || []).map(x => [x.id, { label: x.label, category: x.category || "", profiles_allowed: x.profiles_allowed ?? null }]));

        // Construire les listes labs filtrées par media (en s'appuyant sur mediatype du JSON complet)
        labsSendersByMedia = { video: [], audio: [], data: [] };
        labsReceiversByMedia = { video: [], audio: [], data: [] };

        for (const [id, lab] of sendersLabsById.entries()) {
          const full = sendersFullById.get(id);
          const m = normMedia(full && full.mediatype);
          if (m && labsSendersByMedia[m]) {
            labsSendersByMedia[m].push({ id, ...lab });
          }
        }

        for (const [id, lab] of receiversLabsById.entries()) {
          const full = receiversFullById.get(id);
          const m = normMedia(full && full.mediatype);
          if (m && labsReceiversByMedia[m]) {
            labsReceiversByMedia[m].push({ id, ...lab });
          }
        }

        // tri alpha
        for (const k of ["video", "audio", "data"]) {
          labsSendersByMedia[k].sort((a, b) => (a.label || "").localeCompare(b.label || "", "fr"));
          labsReceiversByMedia[k].sort((a, b) => (a.label || "").localeCompare(b.label || "", "fr"));
        }

        catalogReady = true;
      } catch (e) {
        catalogReady = false;
        toast("warning", t("wf_toast_catalog_title"), t("wf_toast_catalog_err"), { error: String(e) });
      }
    }

    function getDisplayLabel(kind, id, fallbackText) {
      // kind = "sender" | "receiver"
      if (id) {
        const lab = (kind === "sender" ? sendersLabsById.get(id) : receiversLabsById.get(id));
        if (lab && lab.label) return lab.label;
        // si pas dans labs, afficher l'id (cas rare)
        return id;
      }
      return fallbackText || "";
    }

    function findLabsItemByLabel(kind, media, labelText) {
      const q = String(labelText || "").toLowerCase().trim();
      if (!q) return null;
      const list = (kind === "sender")
        ? (labsSendersByMedia[media] || [])
        : (labsReceiversByMedia[media] || []);
      // match exact (case-insensitive)
      return list.find(it => String(it.label || "").toLowerCase().trim() === q) || null;
    }

    // Autocomplete dropdown unique (réutilisé)
    const ac = {
      box: null,
      currentInput: null,
      currentItems: [],
      currentKind: "sender",
      currentMedia: "video",
      currentIndex: -1,
    };

    function ensureAcBox() {
      if (ac.box) return ac.box;
      const box = document.createElement("div");
      box.id = "wf-ac-box";
      box.className = "fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg text-xs max-h-64 overflow-auto hidden";
      box.style.minWidth = "240px";
      document.body.appendChild(box);
      ac.box = box;

      box.addEventListener("mousedown", (e) => {
        const row = e.target.closest("[data-ac-id]");
        if (!row || !ac.currentInput) return;
        const id = row.getAttribute("data-ac-id");
        const label = row.getAttribute("data-ac-label");

        // appliquer la sélection dans le modèle
        const idx = parseInt(ac.currentInput.getAttribute("data-i"), 10);
        const key = ac.currentKind === "sender" ? "sender_id" : "receiver_id";
        const wf = getCurrent();
        if (wf && wf.items && wf.items[idx]) {
          wf.items[idx][key] = id;
          if (ac.currentKind === "sender") wf.items[idx]._senderText = "";
          else wf.items[idx]._receiverText = "";
        }

        // affichage: label
        ac.currentInput.value = label;
        hideAcBox();
        updatePreviewAndValidation();
        // re-render léger pour garder cohérence (optionnel). Ici on évite rerender complet.
        e.preventDefault();
      });

      document.addEventListener("mousedown", (e) => {
        if (!ac.box) return;
        if (ac.currentInput && (e.target === ac.currentInput || ac.box.contains(e.target))) return;
        hideAcBox();
      });

      window.addEventListener("resize", () => { if (!ac.box.classList.contains("hidden")) placeAcBox(); });
      window.addEventListener("scroll", () => { if (!ac.box.classList.contains("hidden")) placeAcBox(); }, true);

      return box;
    }

    function placeAcBox() {
      if (!ac.currentInput || !ac.box) return;
      const r = ac.currentInput.getBoundingClientRect();
      ac.box.style.left = (r.left) + "px";
      ac.box.style.top = (r.bottom + 4) + "px";
      ac.box.style.width = (r.width) + "px";
    }

    function hideAcBox() {
      if (!ac.box) return;
      ac.box.classList.add("hidden");
      ac.currentInput = null;
      ac.currentItems = [];
      ac.currentIndex = -1;
    }

    function showAcBox(inputEl, items, kind, media, query) {
      ensureAcBox();
      ac.currentInput = inputEl;
      ac.currentItems = items;
      ac.currentKind = kind;
      ac.currentMedia = media;

      const q = String(query || "").toLowerCase().trim();
      const filtered = items
        .filter(it => {
          const h = (it.label || "").toLowerCase();
          const c = (it.category || "").toLowerCase();
          return !q || h.includes(q) || c.includes(q);
        })
        .slice(0, 30);

      if (!filtered.length) {
        hideAcBox();
        return;
      }

      ac.box.innerHTML = filtered.map(it => `
        <div class="px-2 py-1 hover:bg-blue-50 cursor-pointer" data-ac-id="${it.id}" data-ac-label="${escapeHtml(it.label)}" title="${escapeHtml(it.id)}">
          <div class="font-medium text-gray-800 truncate">${escapeHtml(it.label)}</div>
          <div class="text-[11px] text-gray-500 truncate">${escapeHtml(it.category || "")} <span class="text-gray-300">•</span> <span class="font-mono text-gray-400">${escapeHtml(it.id.substring(0, 8))}…</span></div>
        </div>
      `).join("");

      ac.box.classList.remove("hidden");
      placeAcBox();
    }

    function bindAutocompleteForRowInputs(containerEl, wf) {
      if (!catalogReady) return;

      containerEl.querySelectorAll("input.wf-ac-sender, input.wf-ac-receiver").forEach(inputEl => {
        const idx = parseInt(inputEl.getAttribute("data-i"), 10);
        const kind = inputEl.classList.contains("wf-ac-sender") ? "sender" : "receiver";

        function getMediaForRow() {
          const m = normMedia(wf.items[idx]?.media);
          return (m === "video" || m === "audio" || m === "data") ? m : "video";
        }

        function getItems() {
          const media = getMediaForRow();
          return kind === "sender" ? (labsSendersByMedia[media] || []) : (labsReceiversByMedia[media] || []);
        }

        inputEl.addEventListener("focus", () => {
          showAcBox(inputEl, getItems(), kind, getMediaForRow(), inputEl.value);
        });

        inputEl.addEventListener("input", () => {
          // mode "texte" : on garde ce que tape l'opérateur
          const text = inputEl.value;
          if (kind === "sender") wf.items[idx]._senderText = text;
          else wf.items[idx]._receiverText = text;

          // tant qu'on n'a pas sélectionné, on ne prétend pas avoir un id valide
          const key = kind === "sender" ? "sender_id" : "receiver_id";
          wf.items[idx][key] = "";

          showAcBox(inputEl, getItems(), kind, getMediaForRow(), text);
          updatePreviewAndValidation();
        });

        // si l'opérateur tape exactement un label existant, on résout automatiquement (optionnel mais pratique)
        inputEl.addEventListener("blur", () => {
          const media = getMediaForRow();
          const picked = findLabsItemByLabel(kind, media, inputEl.value);
          if (picked) {
            const key = kind === "sender" ? "sender_id" : "receiver_id";
            wf.items[idx][key] = picked.id;
            if (kind === "sender") wf.items[idx]._senderText = "";
            else wf.items[idx]._receiverText = "";
            inputEl.value = picked.label;
            updatePreviewAndValidation();
          }
          // sinon on laisse le texte, et validation dira "id manquant"
          setTimeout(() => hideAcBox(), 150);
        });
      });
    }


    // -----------------------------
    // State
    // -----------------------------
    let workflows = [];
    let currentId = null;

    function makeId() {
      // stable et lisible
      const d = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      return `wf_${stamp}`;
    }

    function isoLocal() {
      // pour affichage simple
      const d = new Date();
      return d.toISOString();
    }

    function getCurrent() {
      return workflows.find(w => w.id === currentId) || null;
    }

    function setCurrent(workflowId) {
      currentId = workflowId;
      renderList();
      if (typeof uiMode !== 'undefined' && uiMode === 'run') renderRunPanel();
      else renderEditor();
    }

    function normalizeWorkflow(w) {
      const out = {
        id: w.id || makeId(),
        description: (w.description ?? "").toString(),
        created_at: w.created_at || isoLocal(),
        items: Array.isArray(w.items) ? w.items.map(it => ({
          media: (it.media ?? "").toString(),
          sender_id: (it.sender_id ?? "").toString(),
          receiver_id: (it.receiver_id ?? "").toString(),
          note: (it.note ?? "").toString()
        })) : []
      };
      return out;
    }

    function formatStepsCount(count) {
      return count > 1
        ? t("wf_step_count_many", { count })
        : t("wf_step_count_one", { count });
    }

    // -----------------------------
    // Rendering
    // -----------------------------
    function renderList() {
      const q = ($("#wfSearch").val() || "").toLowerCase().trim();
      const list = document.getElementById("wfList");
      list.innerHTML = "";

      const filtered = workflows.filter(w => {
        if (!q) return true;
        const hay = `${w.id} ${w.description} ${w.created_at}`.toLowerCase();
        return hay.includes(q);
      });

      document.getElementById("wfCount").textContent = String(filtered.length);

      if (filtered.length === 0) {
        list.innerHTML = `<div class="p-3 text-xs text-gray-500">${escapeHtml(t("wf_no_workflow"))}</div>`;
        return;
      }

      filtered.forEach(w => {
        const div = document.createElement("div");
        div.className = "list-item px-3 py-3 border-b cursor-pointer";
        if (w.id === currentId) div.classList.add("active");

        const itemsCount = (w.items || []).length;

        div.innerHTML = `
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-xs font-semibold text-gray-800 truncate">${escapeHtml(w.description || t("wf_no_description"))}</div>
              <div class="text-[11px] text-gray-500 mt-1 font-mono truncate">${escapeHtml(w.id)}</div>
              <div class="text-[11px] text-gray-400 mt-1">${escapeHtml(t("wf_created_prefix"))}${escapeHtml((w.created_at || "").substring(0, 19))}</div>
            </div>
            <div class="flex flex-col items-end gap-2">
              <span class="pill">${escapeHtml(formatStepsCount(itemsCount))}</span>
            </div>
          </div>
        `;

        div.onclick = () => setCurrent(w.id);
        list.appendChild(div);
      });
    }

    function renderEditor() {
      const wf = getCurrent();

      const wfDesc = document.getElementById("wfDesc");
      const wfId = document.getElementById("wfId");
      const wfCreated = document.getElementById("wfCreated");
      const body = document.getElementById("wfStepsBody");

      if (!wf) {
        wfDesc.value = "";
        wfId.value = "";
        wfCreated.value = "";
        body.innerHTML = `<tr><td colspan="6" class="px-2 py-6 text-center text-gray-500 text-xs">${escapeHtml(t("wf_select_or_create"))}</td></tr>`;
        document.getElementById("wfJsonPreview").textContent = "{}";
        document.getElementById("valPill").textContent = t("wf_val_none");
        document.getElementById("valPill").className = "pill";
        return;
      }

      wfDesc.value = wf.description || "";
      wfId.value = wf.id;
      wfCreated.value = (wf.created_at || "").substring(0, 19);

      // steps table
      body.innerHTML = "";

      if (!wf.items || wf.items.length === 0) {
        body.innerHTML = `<tr><td colspan="6" class="px-2 py-6 text-center text-gray-500 text-xs">${escapeHtml(t("wf_no_steps"))}</td></tr>`;
      } else {
        wf.items.forEach((it, idx) => {
          const tr = document.createElement("tr");
          tr.className = "border-b border-gray-100";

          tr.innerHTML = `
            <td class="px-2 py-2 text-gray-500 font-mono">${idx + 1}</td>
            <td class="px-2 py-2">
              <select data-k="media" data-i="${idx}" class="table-input">
                ${renderMediaOptions(it.media)}
              </select>
            </td>
            <td class="px-2 py-2">
              <input data-k="sender_id" data-i="${idx}" class="table-input font-mono wf-ac-sender" placeholder="${escapeAttr(t("wf_input_label_placeholder"))}" value="${escapeAttr(getDisplayLabel('sender', it.sender_id, it._senderText))}">
            </td>
            <td class="px-2 py-2">
              <input data-k="receiver_id" data-i="${idx}" class="table-input font-mono wf-ac-receiver" placeholder="${escapeAttr(t("wf_input_label_placeholder"))}" value="${escapeAttr(getDisplayLabel('receiver', it.receiver_id, it._receiverText))}">
            </td>
            <td class="px-2 py-2">
              <input data-k="note" data-i="${idx}" class="table-input" placeholder="" value="${escapeAttr(it.note || "")}">
            </td>
            <td class="px-2 py-2 text-right">
              <button class="px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="${escapeAttr(t("wf_step_up"))}" data-act="up" data-i="${idx}"><i class="fas fa-arrow-up"></i></button>
              <button class="px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="${escapeAttr(t("wf_step_down"))}" data-act="down" data-i="${idx}"><i class="fas fa-arrow-down"></i></button>
              <button class="px-2 py-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title="${escapeAttr(t("wf_btn_delete"))}" data-act="del" data-i="${idx}"><i class="fas fa-times"></i></button>
            </td>
          `;

          body.appendChild(tr);
        });
      }

      // listeners (inputs + buttons)
      body.querySelectorAll("input[data-k], select[data-k]").forEach(el => {
        el.addEventListener("input", onStepChange);
        el.addEventListener("change", onStepChange);
      });

      body.querySelectorAll("button[data-act]").forEach(btn => {
        btn.addEventListener("click", onStepAction);
      });

      // autocomplete labs (sender/receiver) — basé sur le champ media de chaque ligne
      bindAutocompleteForRowInputs(body, wf);

      // workflow fields listeners
      wfDesc.oninput = () => {
        wf.description = wfDesc.value;
        renderList();
        updatePreviewAndValidation();
      };

      updatePreviewAndValidation();
    }

    function renderMediaOptions(selected) {
      const s = (selected || "").toLowerCase();
      const opts = [
        ["video", t("video")],
        ["audio", t("audio")],
        ["data", t("data")],
        ["virtual", t("virtual")],
        ["", t("wf_media_auto")]
      ];

      return opts.map(([v, label]) => {
        const sel = (v === s) ? "selected" : "";
        return `<option value="${v}" ${sel}>${escapeHtml(label)}</option>`;
      }).join("");
    }

    // -----------------------------
    // Events
    // -----------------------------
    function onStepChange(e) {
      const wf = getCurrent();
      if (!wf) return;

      const i = parseInt(e.target.getAttribute("data-i"), 10);
      const k = e.target.getAttribute("data-k");
      if (!wf.items[i]) return;

      const val = (e.target.value ?? "").toString();

      // Cas spécial: sender/receiver inputs affichent un LABEL (pas l'UUID)
      // L'UUID est défini par l'autocomplete (sélection) ou par résolution exacte au blur.
      if (k === "sender_id") {
        wf.items[i]._senderText = val;
        wf.items[i].sender_id = ""; // pas d'UUID tant que pas sélectionné
      } else if (k === "receiver_id") {
        wf.items[i]._receiverText = val;
        wf.items[i].receiver_id = "";
      } else {
        wf.items[i][k] = val;
      }

      updatePreviewAndValidation();
    }

    function onStepAction(e) {
      const wf = getCurrent();
      if (!wf) return;

      const act = e.currentTarget.getAttribute("data-act");
      const i = parseInt(e.currentTarget.getAttribute("data-i"), 10);

      if (act === "del") {
        wf.items.splice(i, 1);
      } else if (act === "up" && i > 0) {
        const tmp = wf.items[i - 1];
        wf.items[i - 1] = wf.items[i];
        wf.items[i] = tmp;
      } else if (act === "down" && i < wf.items.length - 1) {
        const tmp = wf.items[i + 1];
        wf.items[i + 1] = wf.items[i];
        wf.items[i] = tmp;
      }

      renderEditor();
      updatePreviewAndValidation();
    }

    function addStep() {
      const wf = getCurrent();
      if (!wf) return;

      wf.items.push({ media: "video", sender_id: "", receiver_id: "", note: "" });
      renderEditor();
      updatePreviewAndValidation();
    }

    // -----------------------------
    // Validation + preview JSON
    // -----------------------------
    function validateWorkflow(wf) {
      const errors = [];
      if (!wf.description || !wf.description.trim()) {
        errors.push(t("wf_err_desc_empty"));
      }

      if (!Array.isArray(wf.items) || wf.items.length === 0) {
        errors.push(t("wf_err_no_steps"));
        return { ok: false, errors };
      }

      wf.items.forEach((it, idx) => {
        if (!it.sender_id || !it.sender_id.trim()) errors.push(t("wf_err_missing_sender", { step: idx + 1 }));
        if (!it.receiver_id || !it.receiver_id.trim()) errors.push(t("wf_err_missing_receiver", { step: idx + 1 }));
      });

      return { ok: errors.length === 0, errors };
    }

    function updatePreviewAndValidation() {
      const wf = getCurrent();
      if (!wf) return;

      // preview JSON "propre"
      const clean = normalizeWorkflow(wf);
      document.getElementById("wfJsonPreview").textContent = JSON.stringify(clean, null, 2);

      // validation
      const v = validateWorkflow(clean);
      const pill = document.getElementById("valPill");
      if (v.ok) {
        pill.textContent = t("wf_val_ok");
        pill.className = "pill ok";
      } else {
        pill.textContent = t("wf_val_errors", { count: v.errors.length });
        pill.className = "pill ko";
      }
      pill.title = v.errors.join("\n");
    }

    // -----------------------------
    // Toolbar actions
    // -----------------------------
    async function loadAll() {
      workflows = (await apiList()).map(normalizeWorkflow);
      if (!currentId && workflows.length > 0) currentId = workflows[0].id;
      renderList();
      renderEditor();
    }

    function newWorkflow() {
      const wf = normalizeWorkflow({
        id: makeId(),
        description: "",
        created_at: isoLocal(),
        items: [{ media: "video", sender_id: "", receiver_id: "", note: "" }]
      });
      workflows.unshift(wf);
      setCurrent(wf.id);
      toast("success", "Workflow", t("wf_toast_created"));
    }

    function duplicateWorkflow() {
      const wf = getCurrent();
      if (!wf) return;
      const copy = normalizeWorkflow({
        ...wf,
        id: makeId(),
        created_at: isoLocal(),
        description: (wf.description || "") + t("wf_copy_suffix")
      });
      workflows.unshift(copy);
      setCurrent(copy.id);
      toast("success", "Workflow", t("wf_toast_duplicated"));
    }

    async function deleteWorkflow() {
      const wf = getCurrent();
      if (!wf) return;

      if (!await showModalConfirm(t("wf_confirm_delete"))) return;

      await apiDelete(wf.id);
      workflows = workflows.filter(x => x.id !== wf.id);
      currentId = workflows.length ? workflows[0].id : null;
      renderList();
      renderEditor();
      toast("success", "Workflow", t("wf_toast_deleted"));
    }

    async function saveWorkflow() {
      const wf = getCurrent();
      if (!wf) return;

      const clean = normalizeWorkflow(wf);
      const v = validateWorkflow(clean);
      if (!v.ok) {
        toast("error", "Workflow", t("wf_toast_save_ko"), { errors: v.errors });
        return;
      }

      await apiSave(clean);
      // synchroniser en mémoire avec version normalisée
      const idx = workflows.findIndex(x => x.id === clean.id);
      workflows[idx] = clean;
      renderList();
      renderEditor();
      toast("success", "Workflow", t("wf_toast_saved"));
    }

    function exportWorkflow() {
      const wf = getCurrent();
      if (!wf) return;
      const clean = normalizeWorkflow(wf);
      const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${clean.id}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    function openImport() {
      $("#importText").val("");
      $("#importModal").removeClass("hidden");
    }

    function closeImport() {
      $("#importModal").addClass("hidden");
    }

    function applyImport() {
      const raw = ($("#importText").val() || "").trim();
      if (!raw) {
        toast("warning", "Import", t("wf_toast_import_empty"));
        return;
      }
      try {
        const obj = JSON.parse(raw);
        const wf = normalizeWorkflow(obj);
        // si ID déjà existant, on remplace
        const idx = workflows.findIndex(x => x.id === wf.id);
        if (idx >= 0) workflows[idx] = wf;
        else workflows.unshift(wf);

        setCurrent(wf.id);
        closeImport();
        toast("success", "Import", t("wf_toast_imported"));
      } catch (e) {
        toast("error", "Import", t("wf_toast_import_invalid"), { error: String(e) });
      }
    }

    async function copyJson() {
      const wf = getCurrent();
      if (!wf) return;
      const clean = normalizeWorkflow(wf);
      try {
        await navigator.clipboard.writeText(JSON.stringify(clean, null, 2));
        toast("success", "JSON", t("wf_toast_copied"));
      } catch (e) {
        toast("warning", "JSON", t("wf_toast_copy_err"));
      }
    }

    // HTML escaping
    function escapeHtml(s) {
      return String(s || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
    function escapeAttr(s) { return escapeHtml(s); }


    // -----------------------------
    // Mode (#edit / #run)
    // -----------------------------
    let uiMode = "edit"; // "edit" | "run"
    let runAbort = false;

    function parseHashMode() {
      const h = (location.hash || "").toLowerCase();
      return (h === "#run") ? "run" : "edit";
    }

    function setMode(mode) {
      uiMode = (mode === "run") ? "run" : "edit";

      // URL hash
      const desired = (uiMode === "run") ? "#run" : "#edit";
      if (location.hash !== desired) history.replaceState(null, "", desired);

      // toggle views
      $("#editView").toggleClass("hidden", uiMode !== "edit");
      $("#runView").toggleClass("hidden", uiMode !== "run");

      // toggle buttons (édition)
      const editOnlyIds = ["btnNew", "btnDuplicate", "btnDelete", "btnImport", "btnExport", "btnSave", "btnAddStep", "btnCopyJson"];
      editOnlyIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = (uiMode === "edit") ? "" : "none";
      });

      // run/stop
      $("#btnRun").toggleClass("hidden", uiMode !== "run");
      $("#btnStop").toggleClass("hidden", uiMode !== "run");

      // highlight mode buttons
      const be = $("#btnModeEdit");
      const br = $("#btnModeRun");
      be.removeClass("bg-blue-600 text-white").addClass("text-gray-700");
      br.removeClass("bg-green-600 text-white").addClass("text-gray-700");
      if (uiMode === "edit") be.addClass("bg-blue-600 text-white").removeClass("text-gray-700");
      else br.addClass("bg-green-600 text-white").removeClass("text-gray-700");

      // render right panel
      if (uiMode === "edit") renderEditor();
      else renderRunPanel();
    }

    window.addEventListener("hashchange", () => setMode(parseHashMode()));

    function buildWarningsForWorkflow(wf) {
      const warnings = [];
      if (!wf) return [t("wf_warn_no_wf_selected")];
      if (!wf.items || !wf.items.length) warnings.push(t("wf_warn_no_items"));

      (wf.items || []).forEach((it, idx) => {
        const n = idx + 1;
        const media = normMedia(it.media) || t("wf_media_auto");
        if (!it.sender_id) warnings.push(t("wf_warn_sender_unresolved", { step: n, media }));
        if (!it.receiver_id) warnings.push(t("wf_warn_receiver_unresolved", { step: n, media }));
      });

      return warnings.length ? warnings : [t("wf_run_none")];
    }

    function renderRunPanel() {
      const wf = getCurrent();
      const pill = document.getElementById("runPill");
      const warningsEl = document.getElementById("runWarnings");
      const logEl = document.getElementById("runLog");

      if (!wf) {
        pill.textContent = "—";
        warningsEl.textContent = t("wf_warn_no_wf_selected");
        logEl.textContent = t("wf_run_ready");
        return;
      }

      pill.textContent = formatStepsCount((wf.items || []).length);
      warningsEl.textContent = buildWarningsForWorkflow(wf).join("\n");

      // plan
      const plan = [];
      (wf.items || []).forEach((it, idx) => {
        const n = idx + 1;
        const media = (normMedia(it.media) || "").toUpperCase() || "AUTO";
        const s = getDisplayLabel("sender", it.sender_id, it._senderText);
        const r = getDisplayLabel("receiver", it.receiver_id, it._receiverText);
        plan.push(`${n}. ${media} : ${s}  →  ${r}`);
      });
      logEl.textContent = plan.length ? plan.join("\n") : t("wf_run_no_steps");
    }

    function appendRunLog(line) {
      const logEl = document.getElementById("runLog");
      const cur = logEl.textContent || "";
      const readyText = t("wf_run_ready");
      const next = (cur && cur !== readyText && cur !== "(prêt)" ? cur + "\n" : "") + line;
      logEl.textContent = next;
      logEl.scrollTop = logEl.scrollHeight;
    }

    async function runWorkflowNow() {
      const wf = getCurrent();
      if (!wf) { toast("warning", "Run", t("wf_toast_no_wf_selected")); return; }

      const blocking = (wf.items || []).some(it => !it.sender_id || !it.receiver_id);
      if (blocking) {
        toast("error", "Run", t("wf_toast_run_unresolved"));
        renderRunPanel();
        return;
      }

      if (typeof NmosSwitching === "undefined") {
        toast("error", "Run", t("wf_toast_no_switching_js"));
        return;
      }

      NmosSwitching.configure({
        timeoutMs: 5000,
        notifier: (p) => toast(p.type || "error", p.title || t("sw_title"), p.message || "", p.details || null),
        notifyOnSuccess: false
      });

      runAbort = false;
      $("#btnRun").prop("disabled", true).addClass("opacity-60");
      $("#btnStop").prop("disabled", false).removeClass("opacity-60");

      document.getElementById("runLog").textContent = t("wf_run_starting");
      appendRunLog(`▶ RUN ${wf.id} — ${wf.description || ""}`);

      let okCount = 0;
      for (let i = 0; i < (wf.items || []).length; i++) {
        if (runAbort) { appendRunLog(t("wf_run_stopped")); break; }

        const it = wf.items[i];
        const n = i + 1;
        const media = (normMedia(it.media) || "").toUpperCase() || "AUTO";
        const sLabel = getDisplayLabel("sender", it.sender_id, it._senderText);
        const rLabel = getDisplayLabel("receiver", it.receiver_id, it._receiverText);

        appendRunLog(t("wf_run_step_log", { step: n, total: wf.items.length, media, sender: sLabel, receiver: rLabel }));

        const res = await NmosSwitching.switchSimple(it.sender_id, it.receiver_id);
        if (res.ok) { okCount++; appendRunLog(`✅ OK  (${media})`); }
        else { appendRunLog(`❌ KO  (${media})  ${res.code || ""}  ${res.message || ""}`); }
      }

      appendRunLog(t("wf_run_end_log", { ok: okCount, total: (wf.items || []).length }));

      $("#btnRun").prop("disabled", false).removeClass("opacity-60");
      $("#btnStop").prop("disabled", true).addClass("opacity-60");
    }

    function stopWorkflowNow() { runAbort = true; }


    // -----------------------------
    // Bindings
    // -----------------------------
    document.addEventListener("DOMContentLoaded", async () => {
      await initI18n({ url: "i18n.json", selectId: "langSelect" });

      window.addEventListener("i18n:changed", () => {
        renderList();
        if (uiMode === "run") renderRunPanel();
        else renderEditor();
      });

      await initCatalog();

      $("#wfSearch").on("input", renderList);

      $("#btnNew").on("click", newWorkflow);
      $("#btnDuplicate").on("click", duplicateWorkflow);
      $("#btnDelete").on("click", deleteWorkflow);
      $("#btnSave").on("click", saveWorkflow);
      $("#btnExport").on("click", exportWorkflow);
      $("#btnImport").on("click", openImport);
      $("#btnAddStep").on("click", addStep);
      $("#btnCopyJson").on("click", copyJson);



      $("#btnModeEdit").on("click", () => setMode("edit"));
      $("#btnModeRun").on("click", () => setMode("run"));
      $("#btnRun").on("click", runWorkflowNow);
      $("#btnStop").on("click", stopWorkflowNow);
      $("#btnCloseImport").on("click", closeImport);
      $("#importModal").on("click", (e) => { if (e.target.id === "importModal") closeImport(); });
      $("#btnImportApply").on("click", applyImport);

      await loadAll();

      // appliquer le mode depuis l'URL
      setMode(parseHashMode());
      $("#btnStop").prop("disabled", true).addClass("opacity-60");

      // si aucun workflow, on en crée un "vide" pour guider
      if (!workflows.length) {
        newWorkflow();
      }
    });


// Expose functions globally for inline HTML event handlers
window.toggleMenu = toggleMenu;

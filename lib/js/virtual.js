/**
 * NMOS Express - Virtual Controller (virtual.html)
 */

const $ = s => document.querySelector(s);

    let currentType = 'sources'; // 'sources' ou 'destinations'
    let items = [];
    let selectedId = null;

    let sendersLabs = [];
    let receiversLabs = [];

    let videoSenders = [];
    let audioSenders = [];
    let dataSenders = [];

    let videoReceivers = [];
    let audioReceivers = [];
    let dataReceivers = [];

    function setStatus(msg) {
      $('#status').textContent = msg || '';
    }

    function normalize(str) {
      return (str || '').toLowerCase();
    }

    // Type : on prend aussi "mediatype"
    function detectType(obj) {
      // On utilise le vrai sender/receiver NMOS enrichi
      const fmt = (obj.format || obj.media_type || obj.mediatype || '').toLowerCase();
      if (fmt.indexOf('video') !== -1) return 'video';
      if (fmt.indexOf('audio') !== -1) return 'audio';
      if (fmt.indexOf('data') !== -1 || fmt.indexOf('anc') !== -1) return 'data';
      return 'unknown';
    }


    function displayName(o) {
      return o.custom_label || o.label || o.id;
    }

    // Libellé "humain" pour la liste d'items
    function niceLabel(obj) {
      const parts = [];
      if (obj.custom_label) parts.push(obj.custom_label);
      else if (obj.label) parts.push(obj.label);
      if (obj.node_label) parts.push('[' + obj.node_label + ']');
      else if (obj.device_label) parts.push('[' + obj.device_label + ']');
      return parts.join(' ');
    }

    async function loadLabs() {
      let labsSenders = [];
      let labsReceivers = [];
      let allSenders = [];
      let allReceivers = [];

      try {
        const rsLabs = await fetch('json/JSON_senders_labs.json', { cache: 'no-store' });
        if (rsLabs.ok) labsSenders = await rsLabs.json();
      } catch (e) {
        console.warn('Erreur load json/JSON_senders_labs.json', e);
      }

      try {
        const rrLabs = await fetch('json/JSON_receivers_labs.json', { cache: 'no-store' });
        if (rrLabs.ok) labsReceivers = await rrLabs.json();
      } catch (e) {
        console.warn('Erreur load json/JSON_receivers_labs.json', e);
      }

      try {
        const rsFull = await fetch('json/JSON_senders.json', { cache: 'no-store' });
        if (rsFull.ok) allSenders = await rsFull.json();
      } catch (e) {
        console.warn('Erreur load json/JSON_senders.json', e);
      }

      try {
        const rrFull = await fetch('json/JSON_receivers.json', { cache: 'no-store' });
        if (rrFull.ok) allReceivers = await rrFull.json();
      } catch (e) {
        console.warn('Erreur load json/JSON_receivers.json', e);
      }

      // Maps id -> sender/receiver complet
      const sendersById = {};
      (allSenders || []).forEach(s => { if (s.id) sendersById[s.id] = s; });

      const receiversById = {};
      (allReceivers || []).forEach(r => { if (r.id) receiversById[r.id] = r; });

      // On enrichit les "labs" avec les infos NMOS complètes
      sendersLabs = (labsSenders || []).map(lab => {
        const base = sendersById[lab.id] || {};
        return {
          ...base,
          id: lab.id,
          custom_label: lab.label,     // ton label opérateur : "video"
          profile_id: lab.profile_id   // on le garde si tu veux t'en servir ailleurs
        };
      });

      receiversLabs = (labsReceivers || []).map(lab => {
        const base = receiversById[lab.id] || {};
        return {
          ...base,
          id: lab.id,
          custom_label: lab.label,
          profile_id: lab.profile_id
        };
      });

      // Maintenant on peut classer par type
      videoSenders = [];
      audioSenders = [];
      dataSenders = [];
      (sendersLabs || []).forEach(s => {
        const t = detectType(s);
        if (t === 'video') videoSenders.push(s);
        else if (t === 'audio') audioSenders.push(s);
        else if (t === 'data') dataSenders.push(s);
      });

      videoReceivers = [];
      audioReceivers = [];
      dataReceivers = [];
      (receiversLabs || []).forEach(r => {
        const t = detectType(r);
        if (t === 'video') videoReceivers.push(r);
        else if (t === 'audio') audioReceivers.push(r);
        else if (t === 'data') dataReceivers.push(r);
      });
    }


    async function apiList() {
      setStatus(t('virtual_status_loading'));
      const r = await fetch('php/api_virtual.php?action=list&type=' + currentType, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }

    async function apiSave(obj) {
      const r = await fetch('php/api_virtual.php?action=save&type=' + currentType, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obj)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }

    async function apiDelete(id) {
      const r = await fetch('php/api_virtual.php?action=delete&type=' + currentType, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }

    function parseTags(str) {
      if (!str) return [];
      return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    function tagsToString(tags) {
      if (!Array.isArray(tags)) return '';
      return tags.join(', ');
    }

    function idToDisplay(list, id) {
      if (!id) return '';
      const obj = (list || []).find(o => o.id === id);
      if (!obj) return id;
      return displayName(obj);
    }

    const expandedTagGroups = {
      sources: new Set(),
      destinations: new Set()
    };

    function getPrimaryTag(it) {
      if (Array.isArray(it.tags) && it.tags.length > 0) {
        const first = String(it.tags[0] || '').split(',')[0].trim();
        if (first) return first;
      } else if (typeof it.tags === 'string' && it.tags.trim()) {
        const first = it.tags.split(',')[0].trim();
        if (first) return first;
      }
      return '';
    }

    function renderList() {
      const listEl = $('#itemsList');
      const emptyEl = $('#itemsEmpty');
      listEl.innerHTML = '';

      const filter = normalize($('#filterList').value);
      const filtered = items.filter(it => {
        if (!filter) return true;
        const hay = normalize(it.label) + ' ' + normalize(it.id) + ' ' + normalize((it.tags || []).join(' '));
        return hay.indexOf(filter) !== -1;
      });

      if (filtered.length === 0) {
        emptyEl.style.display = 'block';
        return;
      }
      emptyEl.style.display = 'none';

      // Regrouper par le premier tag
      const groupsMap = new Map();
      filtered.forEach(it => {
        const tagKey = getPrimaryTag(it);
        if (!groupsMap.has(tagKey)) {
          groupsMap.set(tagKey, []);
        }
        groupsMap.get(tagKey).push(it);
      });

      // Trier les clés de groupe (alphabétique + sans tag à la fin)
      const groupKeys = Array.from(groupsMap.keys()).sort((a, b) => {
        if (!a && b) return 1;
        if (a && !b) return -1;
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });

      const expandedSet = expandedTagGroups[currentType] || expandedTagGroups.sources;

      groupKeys.forEach(tagKey => {
        const groupItems = groupsMap.get(tagKey) || [];
        // Tri naturel des éléments dans chaque groupe
        groupItems.sort((a, b) => {
          const la = a.label || a.id || '';
          const lb = b.label || b.id || '';
          return la.localeCompare(lb, undefined, { numeric: true, sensitivity: 'base' });
        });

        const groupWrapper = document.createElement('div');
        groupWrapper.className = 'tag-group';

        const isCollapsed = !filter && !expandedSet.has(tagKey);

        const header = document.createElement('div');
        header.className = 'tag-group-header';

        const caret = document.createElement('span');
        caret.className = 'tag-group-caret';
        caret.textContent = isCollapsed ? '▸' : '▾';

        const title = document.createElement('span');
        title.className = 'tag-group-title';
        title.textContent = tagKey || t('graph_uncategorized');

        const countBadge = document.createElement('span');
        countBadge.className = 'tag-group-count';
        countBadge.textContent = String(groupItems.length);

        header.appendChild(caret);
        header.appendChild(title);
        header.appendChild(countBadge);

        header.onclick = () => {
          if (expandedSet.has(tagKey)) {
            expandedSet.delete(tagKey);
          } else {
            expandedSet.add(tagKey);
          }
          renderList();
        };

        groupWrapper.appendChild(header);

        if (!isCollapsed) {
          const itemsContainer = document.createElement('div');
          itemsContainer.className = 'tag-group-items';

          groupItems.forEach(it => {
            const row = document.createElement('div');
            row.className = 'item-row' + (it.id === selectedId ? ' active' : '');

            const top = document.createElement('div');
            top.className = 'item-row-top';

            const labelDiv = document.createElement('div');
            labelDiv.className = 'item-row-label';
            labelDiv.textContent = it.label || t('virtual_no_label');

            const icons = document.createElement('div');
            icons.className = 'icons';

            const hasVideo = currentType === 'sources' ? !!it.video_sender : !!it.video_receiver;
            const hasAudio = currentType === 'sources' ? !!it.audio_sender : !!it.audio_receiver;
            const hasData = currentType === 'sources' ? !!it.data_sender : !!it.data_receiver;

            const iconV = document.createElement('div');
            iconV.className = 'icon-type video' + (hasVideo ? ' active' : '');
            iconV.textContent = 'V';

            const iconA = document.createElement('div');
            iconA.className = 'icon-type audio' + (hasAudio ? ' active' : '');
            iconA.textContent = 'A';

            const iconD = document.createElement('div');
            iconD.className = 'icon-type data' + (hasData ? ' active' : '');
            iconD.textContent = 'D';

            icons.appendChild(iconV);
            icons.appendChild(iconA);
            icons.appendChild(iconD);

            top.appendChild(labelDiv);
            top.appendChild(icons);

            const sub = document.createElement('div');
            sub.className = 'item-row-id';
            sub.textContent = it.id;

            row.appendChild(top);
            row.appendChild(sub);

            row.onclick = () => {
              selectedId = it.id;
              fillForm(it);
              renderList();
            };

            itemsContainer.appendChild(row);
          });

          groupWrapper.appendChild(itemsContainer);
        }

        listEl.appendChild(groupWrapper);
      });
    }

    let labelAutoSync = true;

    function clearForm() {
      $('#fieldId').value = '';
      $('#fieldLabel').value = '';
      $('#fieldDescription').value = '';
      $('#fieldTags').value = '';
      $('#fieldVideo').value = '';
      $('#fieldAudio').value = '';
      $('#fieldData').value = '';
      labelAutoSync = true;
      hideAllSuggestions();
      updateMeta();
    }

    function fillForm(it) {
      $('#fieldId').value = it.id || '';
      $('#fieldLabel').value = it.label || '';
      $('#fieldDescription').value = it.description || '';
      $('#fieldTags').value = tagsToString(it.tags);
      labelAutoSync = !String(it.label || '').trim();

      if (currentType === 'sources') {
        $('#fieldVideo').value = idToDisplay(videoSenders, it.video_sender);
        $('#fieldAudio').value = idToDisplay(audioSenders, it.audio_sender);
        $('#fieldData').value = idToDisplay(dataSenders, it.data_sender);
      } else {
        $('#fieldVideo').value = idToDisplay(videoReceivers, it.video_receiver);
        $('#fieldAudio').value = idToDisplay(audioReceivers, it.audio_receiver);
        $('#fieldData').value = idToDisplay(dataReceivers, it.data_receiver);
      }
      updateMeta();
    }

    function findByInput(list, input) {
      if (!input) return null;
      const v = input.trim();
      if (!v) return null;

      // 1. match exact sur custom_label ou label
      let obj = (list || []).find(o => (o.custom_label || o.label || '').trim() === v);
      if (obj) return obj;

      // 2. match sur niceLabel
      obj = (list || []).find(o => niceLabel(o) === v);
      if (obj) return obj;

      // 3. fallback : match direct sur l'id
      obj = (list || []).find(o => o.id === v);
      return obj || null;
    }

    function resolveId(list, value) {
      const obj = findByInput(list, value);
      return obj ? obj.id : null;
    }

    function getFormObject() {
      const id = $('#fieldId').value.trim();
      if (!id) {
        alert(t('virtual_err_id_required'));
        return null;
      }

      const obj = {
        id: id,
        label: $('#fieldLabel').value.trim(),
        description: $('#fieldDescription').value.trim(),
        tags: parseTags($('#fieldTags').value)
      };

      const videoInput = $('#fieldVideo').value.trim();
      const audioInput = $('#fieldAudio').value.trim();
      const dataInput = $('#fieldData').value.trim();

      if (currentType === 'sources') {
        const videoId = resolveId(videoSenders, videoInput);
        const audioId = resolveId(audioSenders, audioInput);
        const dataId = resolveId(dataSenders, dataInput);

        if (videoInput && !videoId) {
          alert(t('virtual_err_video_sender'));
          return null;
        }
        if (audioInput && !audioId) {
          alert(t('virtual_err_audio_sender'));
          return null;
        }
        if (dataInput && !dataId) {
          alert(t('virtual_err_data_sender'));
          return null;
        }

        obj.video_sender = videoId || null;
        obj.audio_sender = audioId || null;
        obj.data_sender = dataId || null;

      } else { // destinations
        const videoId = resolveId(videoReceivers, videoInput);
        const audioId = resolveId(audioReceivers, audioInput);
        const dataId = resolveId(dataReceivers, dataInput);

        if (videoInput && !videoId) {
          alert(t('virtual_err_video_receiver'));
          return null;
        }
        if (audioInput && !audioId) {
          alert(t('virtual_err_audio_receiver'));
          return null;
        }
        if (dataInput && !dataId) {
          alert(t('virtual_err_data_receiver'));
          return null;
        }

        obj.video_receiver = videoId || null;
        obj.audio_receiver = audioId || null;
        obj.data_receiver = dataId || null;


        // conserver virtual_sender_id si présent
        const existing = items.find(i => i.id === id);
        if (existing && typeof existing.virtual_sender_id !== 'undefined') {
          obj.virtual_sender_id = existing.virtual_sender_id;
        }


      }

      return obj;
    }

    function updateMeta() {
      const id = $('#fieldId').value.trim() || '—';
      const label = $('#fieldLabel').value.trim() || '—';
      $('#metaType').textContent = currentType === 'sources' ? t('virtual_meta_type_source') : t('virtual_meta_type_dest');
      $('#metaIdPreview').textContent = t('virtual_meta_id', { id });
      $('#metaLabelPreview').textContent = t('virtual_meta_label', { label });
    }

    async function refresh() {
      try {
        items = await apiList();
        setStatus('');
      } catch (e) {
        console.error(e);
        setStatus(t('virtual_status_load_error'));
        items = [];
      }

      if (selectedId) {
        const it = items.find(i => i.id === selectedId);
        if (it) fillForm(it);
        else {
          selectedId = null;
          clearForm();
        }
      } else {
        clearForm();
      }
      renderList();
    }

    function updateTitlesForType() {
      const listKey = currentType === 'sources' ? 'virtual_tab_sources' : 'virtual_tab_destinations';
      const formKey = currentType === 'sources' ? 'virtual_form_title_source' : 'virtual_form_title_dest';
      $('#listTitle').setAttribute('data-i18n', listKey);
      $('#listTitle').textContent = t(listKey);
      $('#formTitle').setAttribute('data-i18n', formKey);
      $('#formTitle').textContent = t(formKey);
    }

    function setType(type) {
      currentType = type;
      selectedId = null;

      $('#tabSources').classList.toggle('active', type === 'sources');
      $('#tabDestinations').classList.toggle('active', type === 'destinations');
      updateTitlesForType();

      updateMeta();
      refresh();
    }

    // ------- AUTOCOMPLETE CUSTOM -------

    function setupAutocomplete(inputId, listGetter, acId) {
      const input = $(inputId);
      const panel = $(acId);

      function showSuggestions() {
        const term = normalize(input.value);
        const list = listGetter() || [];
        panel.innerHTML = '';

        const candidates = list.filter(o => {
          const d = normalize(displayName(o));
          if (!term) return true;
          return d.indexOf(term) !== -1;
        }).slice(0, 20);

        if (candidates.length === 0) {
          panel.style.display = 'none';
          return;
        }

        candidates.forEach(o => {
          const item = document.createElement('div');
          item.className = 'ac-item';
          const spanMain = document.createElement('span');
          spanMain.className = 'ac-main';
          spanMain.textContent = displayName(o);
          const spanId = document.createElement('span');
          spanId.className = 'ac-id';
          spanId.textContent = o.id;
          item.appendChild(spanMain);
          item.appendChild(spanId);
          item.onclick = () => {
            input.value = displayName(o);
            panel.style.display = 'none';
          };
          panel.appendChild(item);
        });

        panel.style.display = 'block';
      }

      input.addEventListener('input', showSuggestions);
      input.addEventListener('focus', showSuggestions);
      input.addEventListener('blur', () => {
        setTimeout(() => { panel.style.display = 'none'; }, 150);
      });
    }

    function setupTagsAutocomplete(inputId, acId) {
      const input = $(inputId);
      const panel = $(acId);

      function getExistingTags() {
        const tagMap = new Map();
        (items || []).forEach(it => {
          const tags = Array.isArray(it.tags) ? it.tags : parseTags(it.tags || '');
          tags.forEach(tg => {
            const clean = String(tg || '').trim();
            if (!clean) return;
            const key = normalize(clean);
            if (!tagMap.has(key)) {
              tagMap.set(key, clean);
            }
          });
        });
        return Array.from(tagMap.values()).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        );
      }

      function showTagSuggestions(filterByInput) {
        const allTags = getExistingTags();
        panel.innerHTML = '';

        const rawVal = input.value || '';
        const lastCommaIdx = rawVal.lastIndexOf(',');
        const prefix = lastCommaIdx !== -1 ? rawVal.slice(0, lastCommaIdx + 1) : '';
        const currentToken = lastCommaIdx !== -1 ? rawVal.slice(lastCommaIdx + 1) : rawVal;
        const term = filterByInput ? normalize(currentToken) : '';

        const candidates = allTags.filter(tg => {
          if (!term) return true;
          return normalize(tg).indexOf(term) !== -1;
        }).slice(0, 30);

        if (candidates.length === 0) {
          panel.style.display = 'none';
          return;
        }

        candidates.forEach(tg => {
          const item = document.createElement('div');
          item.className = 'ac-item';
          const spanMain = document.createElement('span');
          spanMain.className = 'ac-main';
          spanMain.textContent = tg;
          item.appendChild(spanMain);
          item.onclick = () => {
            input.value = prefix ? `${prefix} ${tg}` : tg;
            panel.style.display = 'none';
          };
          panel.appendChild(item);
        });

        panel.style.display = 'block';
      }

      input.addEventListener('input', () => showTagSuggestions(true));
      input.addEventListener('focus', () => showTagSuggestions(false));
      input.addEventListener('blur', () => {
        setTimeout(() => { panel.style.display = 'none'; }, 150);
      });
    }

    function hideAllSuggestions() {
      ['acVideo', 'acAudio', 'acData', 'acTags'].forEach(id => {
        const el = $('#' + id);
        if (el) el.style.display = 'none';
      });
    }

    // Events
    $('#tabSources').onclick = () => setType('sources');
    $('#tabDestinations').onclick = () => setType('destinations');

    $('#filterList').oninput = () => renderList();

    $('#fieldId').oninput = () => {
      if (labelAutoSync || !$('#fieldLabel').value.trim()) {
        labelAutoSync = true;
        $('#fieldLabel').value = $('#fieldId').value;
      }
      updateMeta();
    };
    $('#fieldLabel').oninput = () => {
      labelAutoSync = !$('#fieldLabel').value.trim();
      updateMeta();
    };

    $('#btnNew').onclick = () => {
      selectedId = null;
      clearForm();
      $('#fieldId').focus();
    };

    $('#btnDuplicate').onclick = () => {
      if (!selectedId) {
        alert(t('virtual_err_select_duplicate'));
        return;
      }
      const it = items.find(i => i.id === selectedId);
      if (!it) return;
      const dup = JSON.parse(JSON.stringify(it));
      dup.id = it.id + '_copy';
      dup.label = (it.label || '') + t('virtual_copy_suffix');
      selectedId = null;
      fillForm(dup);
    };

    $('#btnSave').onclick = async () => {
      const obj = getFormObject();
      if (!obj) return;

      try {
        setStatus(t('virtual_status_saving'));
        await apiSave(obj);
        setStatus(t('virtual_status_saved'));
        selectedId = obj.id;
        await refresh();
        setTimeout(() => setStatus(''), 1200);
      } catch (e) {
        console.error(e);
        setStatus(t('virtual_status_save_error'));
        alert(t('virtual_err_save_alert'));
      }
    };

    $('#btnDelete').onclick = async () => {
      if (!selectedId) {
        alert(t('virtual_err_none_selected'));
        return;
      }
      if (!await showModalConfirm(t('virtual_confirm_delete'))) return;
      try {
        setStatus(t('virtual_status_deleting'));
        await apiDelete(selectedId);
        selectedId = null;
        await refresh();
        setStatus(t('virtual_status_deleted'));
        setTimeout(() => setStatus(''), 1200);
      } catch (e) {
        console.error(e);
        setStatus(t('virtual_status_delete_error'));
        alert(t('virtual_err_delete_alert'));
      }
    };

    window.addEventListener('i18n:changed', () => {
      updateTitlesForType();
      updateMeta();
      renderList();
    });

    // Init
    (async function init() {
      await initI18n({ url: 'json/i18n.json', selectId: 'langSelect' });
      await loadLabs();   // charge JSON_senders_labs / JSON_receivers_labs
      setType('sources'); // configure et charge les virtual sources

      // autocomplete : sources/destinations selon currentType (géré dans getFormObject via resolveId)
      setupAutocomplete('#fieldVideo', () => currentType === 'sources' ? videoSenders : videoReceivers, '#acVideo');
      setupAutocomplete('#fieldAudio', () => currentType === 'sources' ? audioSenders : audioReceivers, '#acAudio');
      setupAutocomplete('#fieldData', () => currentType === 'sources' ? dataSenders : dataReceivers, '#acData');
      setupTagsAutocomplete('#fieldTags', '#acTags');
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

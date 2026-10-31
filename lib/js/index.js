/**
 * NMOS Express - Matrix Controller (index.html)
 */

let sources = [];
		let destinations = [];

		let virtualSources = [];
		let virtualDestinations = [];

		let currentMediaFilter = "video";

		let showOnlyLabs = true;
		let showOnlyActive = false;
		let labsSenders = new Set();
		let labsReceivers = new Set();

		// Profils pour les senders / receivers "labs"
		// senderProfiles: { sender_id: "profile_id" }
		// receiverProfilesAllowed: { receiver_id: "*" | [ ... ] }
		let senderProfiles = {};
		let receiverProfilesAllowed = {};

		let labsSendersMap = {};
		let labsReceiversMap = {};

		//disparition des options de séléction si "virtual"
		function changeType() {
			const el = document.getElementById("selectionOptions");
			if (!el) return;
			const val = document.getElementById("mediaSelect") ? document.getElementById("mediaSelect").value : "";
			if (val === "virtual") {
				el.style.display = "none";
			} else {
				el.style.display = "flex";
			}
		}

		function prettyJson(data) {
			if (data == null) return "";
			// si c'est déjà un objet
			if (typeof data === "object") {
				return JSON.stringify(data, null, 2);
			}
			// si c'est une string JSON
			if (typeof data === "string") {
				try {
					const obj = JSON.parse(data);
					return JSON.stringify(obj, null, 2);
				} catch (e) {
					return data; // pas du JSON -> on renvoie brut
				}
			}
			return String(data);
		}



		function toogleLog() {

			if ($('#consoleLog').attr('status') == "open") {
				$('#consoleLog').attr('status', "close")
				$('#consoleLog').css('height', '40px')
				$('#zoomLog').addClass('fa-expand')
				$('#zoomLog').removeClass('fa-window-close')
			} else {
				$('#consoleLog').attr('status', "open")
				$('#consoleLog').css('height', '500px')
				$('#zoomLog').removeClass('fa-expand')
				$('#zoomLog').addClass('fa-window-close')
			}

		}

		async function loadJson(path) {
			const r = await fetch(path, { cache: "no-store" });
			if (!r.ok) throw new Error(`HTTP ${r.status} sur ${path}`);
			return r.json();
		}

		async function loadNmosData() {
			const senders = await loadJson("json/JSON_senders.json");
			const receivers = await loadJson("json/JSON_receivers.json");

			virtualSources = await loadJson("json/JSON_virtual_sources.json");
			virtualDestinations = await loadJson("json/JSON_virtual_destinations.json");

			sources = senders.map(s => ({
				id: s.id,
				label: s.label,
				custom_label: s.custom_label || null,
				display_label: (s.custom_label || s.label || s.id),
				equipement: s.equipement,
				mediatype: (s.mediatype || "video").toLowerCase(),
				control_href: s.control_href || null,
				sdp_href: s.sdp_href || null,
				device_id: s.device_id || null
			}));

			destinations = receivers.map(d => ({
				id: d.id,
				label: d.label,
				custom_label: d.custom_label || null,
				display_label: (d.custom_label || d.label || d.id),
				equipement: d.equipement,
				mediatype: (d.mediatype || "video").toLowerCase(),
				control_href: d.control_href || null,
				device_id: d.device_id || null,
				subscription_active: d.subscription_active || false,
				subscription_sender_id: d.subscription_sender_id || null
			}));

			try {
				const sendersLabs = await loadJson("json/JSON_senders_labs.json");

				// map id -> entrée complète
				labsSendersMap = {};
				labsSenders = new Set();
				senderProfiles = {};

				sendersLabs.forEach(x => {
					if (!x.id) return;
					labsSenders.add(x.id);
					labsSendersMap[x.id] = x;
					if (x.profile_id) {
						senderProfiles[x.id] = x.profile_id;
					}
				});

			} catch (e) {
				labsSenders = new Set();
				senderProfiles = {};
				labsSendersMap = {};
			}

			try {
				const receiversLabs = await loadJson("json/JSON_receivers_labs.json");
				labsReceiversMap = {};
				labsReceivers = new Set();
				receiverProfilesAllowed = {};

				receiversLabs.forEach(x => {
					if (!x.id) return;
					labsReceivers.add(x.id);
					labsReceiversMap[x.id] = x;
					if (typeof x.profiles_allowed !== "undefined") {
						receiverProfilesAllowed[x.id] = x.profiles_allowed;
					}
				});

			} catch (e) {

				labsReceivers = new Set();
				receiverProfilesAllowed = {};
				labsReceiversMap = {};

			}


			// Injecter label custom + category provenant des *_labs dans sources
			sources = sources.map(s => {
				const lab = labsSendersMap[s.id];
				if (lab) {
					const customLabel = (lab.label !== undefined) ? lab.label : s.custom_label;
					const category = lab.category || "";
					return Object.assign({}, s, {
						custom_label: customLabel,
						display_label: (customLabel || s.label || s.id),
						category: category
					});
				}
				return Object.assign({}, s, {
					category: s.category || ""
				});
			});

			// Même chose pour les destinations
			destinations = destinations.map(d => {
				const lab = labsReceiversMap[d.id];
				if (lab) {
					const customLabel = (lab.label !== undefined) ? lab.label : d.custom_label;
					const category = lab.category || "";
					return Object.assign({}, d, {
						custom_label: customLabel,
						display_label: (customLabel || d.label || d.id),
						category: category
					});
				}
				return Object.assign({}, d, {
					category: d.category || ""
				});
			});



		}

		let activeConnections = {};

		let filterSrc = "";
		let filterDest = "";

		let collapsedGroups = { sources: {}, destinations: {} };

		function needProfileCheck(source_id, destination_id) {
			// On applique le contrôle seulement si :
			//  - le sender est un "labs" (custom label, présent dans JSON_senders_labs)
			//  - le receiver a un filtre défini dans JSON_receivers_labs
			return labsSenders.has(source_id) &&
				Object.prototype.hasOwnProperty.call(receiverProfilesAllowed, destination_id);
		}

		function isProfileCompatible(source_id, destination_id) {
			if (!needProfileCheck(source_id, destination_id)) {
				// Hors scope : commutation libre
				return true;
			}

			const allowed = receiverProfilesAllowed[destination_id];

			// Receiver sans filtre ou "*" => tout accepté
			if (!allowed || allowed === "*") {
				return true;
			}

			const senderProfile = senderProfiles[source_id] || null;

			// Receiver a une liste, mais le sender n'a pas de profil -> on refuse
			if (!senderProfile) {
				return false;
			}

			if (Array.isArray(allowed)) {
				return allowed.indexOf(senderProfile) !== -1;
			}

			// Cas exotique : on reste permissif pour ne pas tout casser
			return true;
		}

		async function commutation(source_id, destination_id) {
			// --- CONTRÔLE DES PROFILS AVANT COMMUTATION ---
			if (!isProfileCompatible(source_id, destination_id)) {
				const senderProfile = senderProfiles[source_id] || "(aucun profil)";
				const allowed = receiverProfilesAllowed[destination_id];
				const allowedStr = Array.isArray(allowed)
					? allowed.join(", ")
					: String(allowed);

				logToConsole(
					t("switch_refused_profile") +
					` sender=${source_id} (profile=${senderProfile}) -> ` +
					`receiver=${destination_id} (profiles_allowed=${allowedStr})`,
					true
				);

				alert(t("switch_refused_alert"));
				return;
			}

			// --- COMMUTATION NORMALE SI OK ---
			try {
				logToConsole(`NMOS switching ${source_id} -> ${destination_id} ...`, true);

				const r = await fetch("php/api_switch.php", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sender_id: source_id, receiver_id: destination_id })
				});

				const res = await r.json();
				if (!res.ok) throw new Error(res.error || "switch failed");

				logToConsole("PATCH /staged — JSON envoyé :", true);
				logToConsole(prettyJson(res.sent_json), false);
				logToConsole("PATCH /staged — JSON renvoyé par le receiver :", true);
				logToConsole(prettyJson(res.received_json) || "(vide ou non-JSON)", false);

				activeConnections[destination_id] = source_id;
				logToConsole(t("switch_ok") + `${source_id} -> ${destination_id}`, true);


				if (currentMediaFilter === "virtual") {
					renderGridVirtual();
				} else {
					renderGrid();
				}



			} catch (e) {
				console.error(e);
				logToConsole(t("switch_failed") + e.message, true);
				alert(t("switch_failed") + e.message);
			}
		}

		function toggleGroup(axis, groupName) {
			if (axis === 'source') {
				collapsedGroups.sources[groupName] = !collapsedGroups.sources[groupName];
			} else {
				collapsedGroups.destinations[groupName] = !collapsedGroups.destinations[groupName];
			}

			if (currentMediaFilter === "virtual") {
				renderGridVirtual();
			} else {
				renderGrid();
			}
		}


		function handleFilterChange(equipement, value) {
			if (equipement === 'source') filterSrc = value;
			if (equipement === 'dest') filterDest = value;

			if (currentMediaFilter === "virtual") {
				renderGridVirtual();
			} else {
				renderGrid();
			}
		}



		function getGroupName(item) {
			const equip = (item.equipement || "").trim();
			const custom = (item.custom_label || "").trim();
			const category = (item.category || "").trim();

			// 1) Pas de label personnalisé -> groupe = équipement
			if (!custom) {
				return equip || "Sans équipement";
			}

			// 2) Label personnalisé mais pas de catégorie -> groupe = équipement
			if (!category) {
				return equip || "Sans équipement";
			}

			// 3) Label personnalisé ET catégorie -> groupe = catégorie
			return category;
		}





		function groupBy(array, key) {
			const grouped = array.reduce((result, currentValue) => {
				let groupKey;
				if (typeof key === "function") {
					groupKey = key(currentValue);
				} else {
					groupKey = currentValue[key];
				}
				if (!groupKey) groupKey = "Sans équipement";
				(result[groupKey] = result[groupKey] || []).push(currentValue);
				return result;
			}, {});

			Object.keys(grouped).forEach(g => {
				grouped[g].sort((a, b) =>
					(a.display_label || "").localeCompare(b.display_label || "", undefined, { numeric: true, sensitivity: "base" })
				);
			});

			return grouped;
		}



		//ajout
		// ===== BADGES V/A/D =====
		function buildVADBadges(item, isSource) {
			let hasV = false, hasA = false, hasD = false;

			if (isSource) {
				hasV = !!item.video_sender;
				hasA = !!item.audio_sender;
				hasD = !!item.data_sender;
			} else {
				hasV = !!item.video_receiver;
				hasA = !!item.audio_receiver;
				hasD = !!item.data_receiver;
			}

			let html = '';
			if (hasV) html += '<span class="badge"><span class="fa fa-video text-gray-500"></span></span>';
			if (hasA) html += '<span class="badge"><span class="fa fa-volume-up text-gray-500"></span></span>';
			if (hasD) html += '<span class="badge"><span class="fa fa-stream text-gray-500"></span></span>';
			return html;
		}

		// ===== UTILISATION DE TAGS POUR LE GROUPEMENT =====
		function prepareVirtual(array, isSource) {
			return array.map(v => ({
				...v,
				display_label: v.label,
				equipement: (v.tags && v.tags.length > 0) ? v.tags[0] : "Virtual",
				_isSource: isSource
			}));
		}





		async function softVirtualSwitch(src, dst) {

			const canV = src.video_sender && dst.video_receiver;
			const canA = src.audio_sender && dst.audio_receiver;
			const canD = src.data_sender && dst.data_receiver;

			// Commutations NMOS réelles
			if (canV) await commutation(src.video_sender, dst.video_receiver);
			if (canA) await commutation(src.audio_sender, dst.audio_receiver);
			if (canD) await commutation(src.data_sender, dst.data_receiver);

			// Enregistrement de la commutation virtuelle
			await fetch("php/api_virtual.php?action=save_connection&type=destinations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					dest_id: dst.id,
					virtual_sender_id: src.id
				})
			});

			// Mise à jour de l'état en mémoire
			const idx = virtualDestinations.findIndex(d => d.id === dst.id);
			if (idx !== -1) {
				virtualDestinations[idx].virtual_sender_id = src.id;
			}




			// 3) Recharge la grille virtual
			renderGridVirtual();
		}









		function renderGridVirtual() {


			// --- Sauver le focus et la sélection si on tape dans un champ de recherche ---
			const activeId = document.activeElement ? document.activeElement.id : null;
			let selectionStart = 0, selectionEnd = 0;

			if (activeId && (activeId === 'inputSrc' || activeId === 'inputDest')) {
				selectionStart = document.activeElement.selectionStart || 0;
				selectionEnd = document.activeElement.selectionEnd || 0;
			}
			//

			const table = document.getElementById('matrixTable');
			const emptyHint = document.getElementById('emptyHint');
			table.innerHTML = '';
			emptyHint.classList.add("hidden");
			emptyHint.textContent = "";

			// 1) Préparer les virtual (avec equipement à partir des tags)
			const vSrc = prepareVirtual(virtualSources, true);
			const vDst = prepareVirtual(virtualDestinations, false);

			// 2) Appliquer les filtres texte (même logique que renderGrid)
			const fs = (filterSrc || "").toLowerCase();
			const fd = (filterDest || "").toLowerCase();

			const vSrcFiltered = vSrc.filter(s =>
				(s.display_label || "").toLowerCase().includes(fs) ||
				(s.equipement || "").toLowerCase().includes(fs)
			);

			const vDstFiltered = vDst.filter(d =>
				(d.display_label || "").toLowerCase().includes(fd) ||
				(d.equipement || "").toLowerCase().includes(fd)
			);

			if (vSrcFiltered.length === 0 || vDstFiltered.length === 0) {
				emptyHint.classList.remove("hidden");
				emptyHint.textContent = t("no_virtual_flux");
			}

			const srcGroups = groupBy(vSrcFiltered, 'equipement');
			const dstGroups = groupBy(vDstFiltered, 'equipement');

			const srcGroupNames = Object.keys(srcGroups).sort();
			const dstGroupNames = Object.keys(dstGroups).sort();

			// ========= ENTÊTE =========
			const thead = document.createElement('thead');
			const headerRow = document.createElement('tr');

			const corner = document.createElement('th');
			corner.className = 'sticky-corner';
			corner.innerHTML = `
			<div class="flex flex-col h-full justify-between gap-2 pb-1">
				<div class="text-xs text-gray-600 mb-1">
					<span class="fa fa-clone">&nbsp;&nbsp;<span data-i18n="matrix_virtual">VIRTUAL MATRIX</span></span>
				</div>	
				
				<div class="flex flex-col gap-2">
				
			
				
				
					<div class="relative w-full">
						<input type="text" id="inputSrc" class="mini-input"
							   placeholder="${t('filter_source')}"
							   value="${filterSrc}"
							   oninput="handleFilterChange('source', this.value)">
						<i class="fas fa-long-arrow-alt-right absolute right-2 top-1.5 text-gray-400 text-xs pointer-events-none"></i>
					</div>
					<div class="relative w-full">
						<input type="text" id="inputDest" class="mini-input"
							   placeholder="${t('filter_dest')}"
							   value="${filterDest}"
							   oninput="handleFilterChange('dest', this.value)">
						<i class="fas fa-long-arrow-alt-down absolute right-2 top-1.5 text-gray-400 text-xs pointer-events-none"></i>
					</div>
				</div>
			</div>`;
			headerRow.appendChild(corner);

			// colonnes sources virtuelles groupées
			srcGroupNames.forEach(grp => {
				const isCollapsed = collapsedGroups.sources[grp];
				const count = srcGroups[grp].length;

				// colonne de groupe (avec flèche)
				const thGroup = document.createElement('th');
				thGroup.className = 'sticky-top group-header';
				thGroup.onclick = () => toggleGroup('source', grp);
				const icon = isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';

				thGroup.innerHTML = `
				<div class="vertical-header justify-between text-gray-700 font-bold text-[10px]">
					<span>${grp}</span>
					<i class="fas ${icon} mt-2"></i>
				</div>`;
				headerRow.appendChild(thGroup);

				// colonnes des sources du groupe seulement si non replié
				if (!isCollapsed) {
					srcGroups[grp].forEach(src => {
						const th = document.createElement('th');
						th.className = 'sticky-top';
						th.innerHTML = `
						<div class="vertical-header text-xs font-semibold text-gray-700">
							${src.display_label}
						</div>
						<div class="flex flex-col items-center gap-1 mb-1">
							${buildVADBadges(src, true)}
						</div>
					`;
						headerRow.appendChild(th);
					});
				}
			});



			thead.appendChild(headerRow);
			table.appendChild(thead);

			// ========= LIGNES DESTINATIONS =========
			const tbody = document.createElement('tbody');

			dstGroupNames.forEach(grp => {

				const isDestCollapsed = collapsedGroups.destinations[grp];

				// --- ligne de titre du groupe de destinations ---
				const trGrp = document.createElement('tr');
				const thGrp = document.createElement('th');
				thGrp.className = 'sticky-left group-header';
				thGrp.onclick = () => toggleGroup('dest', grp);
				const iconRow = isDestCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';

				thGrp.innerHTML = `
				<div class="flex justify-between items-center px-2 text-xs text-gray-700">
					<span>${grp}</span>
					<i class="fas ${iconRow} text-[10px]"></i>
				</div>`;
				trGrp.appendChild(thGrp);

				// placeholders pour toutes les colonnes (groupe + sources)
				srcGroupNames.forEach(sg => {
					const tdGroupPh = document.createElement('td');
					tdGroupPh.className = 'separator-row separator-cross';
					trGrp.appendChild(tdGroupPh);

					if (!collapsedGroups.sources[sg]) {
						srcGroups[sg].forEach(() => {
							const tdSep = document.createElement('td');
							tdSep.className = 'separator-row';
							trGrp.appendChild(tdSep);
						});
					}
				});

				tbody.appendChild(trGrp);

				// --- lignes par destination virtuelle ---
				if (!isDestCollapsed) {
					dstGroups[grp].forEach(dst => {
						const tr = document.createElement('tr');

						const th = document.createElement('th');
						th.className = 'sticky-left px-3 py-1 text-xs font-medium text-gray-700 text-left';
						th.innerHTML = `
						${dst.display_label}
						${buildVADBadges(dst, false)}
					`;
						tr.appendChild(th);

						// cellules (groupe + sources)
						srcGroupNames.forEach(srcGrpName => {

							// colonne placeholder pour le groupe de sources
							const tdGrp = document.createElement('td');
							tdGrp.className = 'separator-col';
							tr.appendChild(tdGrp);

							if (!collapsedGroups.sources[srcGrpName]) {
								srcGroups[srcGrpName].forEach(src => {

									const td = document.createElement('td');
									td.className = 'cell-btn text-center cursor-pointer relative';
									td.onclick = () => softVirtualSwitch(src, dst);

									const isVirtualLinked = (dst.virtual_sender_id === src.id);

									const canV = src.video_sender && dst.video_receiver;
									const canA = src.audio_sender && dst.audio_receiver;
									const canD = src.data_sender && dst.data_receiver;

									let usedCount = 0;
									let okCount = 0;

									if (canV) {
										usedCount++;
										const okV = activeConnections[dst.video_receiver] === src.video_sender;
										if (okV) okCount++;
									}
									if (canA) {
										usedCount++;
										const okA = activeConnections[dst.audio_receiver] === src.audio_sender;
										if (okA) okCount++;
									}
									if (canD) {
										usedCount++;
										const okD = activeConnections[dst.data_receiver] === src.data_sender;
										if (okD) okCount++;
									}

									if (isVirtualLinked && usedCount > 0) {
										if (okCount === usedCount) {
											td.classList.add('connected');
										} else if (okCount > 0) {
											td.classList.add('virtual-partial');
										} else {
											td.classList.add('virtual-broken');
										}
									}

									td.innerHTML = isVirtualLinked
										? '<div class="w-2 h-2 bg-white mx-auto rounded-sm"></div>'
										: '<div class="empty-dot"></div>';

									tr.appendChild(td);
								});
							}
						});

						tbody.appendChild(tr);
					});
				}
			});


			table.appendChild(tbody);

			// --- Restaurer le focus + la sélection si on était dans inputSrc / inputDest ---
			if (activeId === 'inputSrc' || activeId === 'inputDest') {
				const el = document.getElementById(activeId);
				if (el && typeof el.setSelectionRange === 'function') {
					el.focus();
					try {
						el.setSelectionRange(selectionStart, selectionEnd);
					} catch (e) {
						// certains navigateurs peuvent râler, on ignore
					}
				}
			}


		}

















		function renderGrid() {
			const activeId = document.activeElement ? document.activeElement.id : null;
			let selectionStart = 0, selectionEnd = 0;
			if (activeId && (activeId === 'inputSrc' || activeId === 'inputDest')) {
				selectionStart = document.activeElement.selectionStart;
				selectionEnd = document.activeElement.selectionEnd;
			}

			const table = document.getElementById('matrixTable');
			const emptyHint = document.getElementById('emptyHint');
			table.innerHTML = '';
			emptyHint.classList.add("hidden");
			emptyHint.textContent = "";

			const visibleSources = sources.filter(s => {
				const f = filterSrc.toLowerCase();
				const lab = (s.display_label || s.label || '').toLowerCase();
				const eqp = (s.equipement || '').toLowerCase();
				const cat = (s.category || '').toLowerCase();
				return lab.includes(f) || eqp.includes(f) || cat.includes(f);
			});

			let visibleSourcesFiltered = visibleSources.filter(s => (s.mediatype || "video") === currentMediaFilter);

			const visibleDests = destinations.filter(d => {
				const f = filterDest.toLowerCase();
				const lab = (d.display_label || d.label || '').toLowerCase();
				const eqp = (d.equipement || '').toLowerCase();
				const cat = (d.category || '').toLowerCase();
				return lab.includes(f) || eqp.includes(f) || cat.includes(f);
			});


			let visibleDestsFiltered = visibleDests.filter(d => (d.mediatype || "video") === currentMediaFilter);

			if (showOnlyLabs) {
				visibleSourcesFiltered = visibleSourcesFiltered.filter(s => labsSenders.has(s.id));
				visibleDestsFiltered = visibleDestsFiltered.filter(d => labsReceivers.has(d.id));
			}

			if (showOnlyActive) {
				const activeSenderIds = new Set(Object.values(activeConnections));
				visibleSourcesFiltered = visibleSourcesFiltered.filter(s => activeSenderIds.has(s.id));
				visibleDestsFiltered = visibleDestsFiltered.filter(d => d.subscription_active);
			}

			if (visibleSourcesFiltered.length === 0 || visibleDestsFiltered.length === 0) {
				emptyHint.classList.remove("hidden");
				emptyHint.innerHTML = showOnlyLabs
					? t("no_labeled_flux_html")
					: t("no_flux_filter");
			}

			const srcGroups = groupBy(visibleSourcesFiltered, getGroupName);
			const destGroups = groupBy(visibleDestsFiltered, getGroupName);


			const srcGroupNames = Object.keys(srcGroups).sort();
			const destGroupNames = Object.keys(destGroups).sort();

			const thead = document.createElement('thead');
			const headerRow = document.createElement('tr');

			const corner = document.createElement('th');
			corner.className = 'sticky-corner';
			// titre de la matrice
			if ($("#mediaSelect").val() == "video") {
				class_icone = "fa fa-video";
				text_matrice = t("matrix_video");
			} else if ($("#mediaSelect").val() == "audio") {
				class_icone = "fa fa-volume-up";
				text_matrice = t("matrix_audio");
			} else if ($("#mediaSelect").val() == "data") {
				class_icone = "fa fa-stream";
				text_matrice = t("matrix_data");
			}

			corner.innerHTML = `
			<div class="flex flex-col gap-2 pb-1">
				<div class="text-xs text-gray-600 mb-1">
					<span class="${class_icone}">&nbsp;&nbsp;${text_matrice}</span>
				</div>

				<div class="relative w-full">
					<input type="text" id="inputSrc" class="mini-input"
						   placeholder="${t('filter_source')}"
						   value="${filterSrc}"
						   oninput="handleFilterChange('source', this.value)">
					<i class="fas fa-long-arrow-alt-right absolute right-2 top-1.5 text-gray-400 text-xs pointer-events-none"></i>
				</div>

				<div class="relative w-full">
					<input type="text" id="inputDest" class="mini-input"
						   placeholder="${t('filter_dest')}"
						   value="${filterDest}"
						   oninput="handleFilterChange('dest', this.value)">
					<i class="fas fa-long-arrow-alt-down absolute right-2 top-1.5 text-gray-400 text-xs pointer-events-none"></i>
				</div>
			</div>
		`;
			headerRow.appendChild(corner);

			srcGroupNames.forEach(grpName => {
				const isCollapsed = collapsedGroups.sources[grpName];
				const count = srcGroups[grpName].length;

				const thGroup = document.createElement('th');
				thGroup.className = 'sticky-top group-header';
				thGroup.onclick = () => toggleGroup('source', grpName);
				thGroup.title = `${t('equipment')}: ${grpName} (${count} items)`;
				const icon = isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';
				thGroup.innerHTML = `<div class="vertical-header justify-between text-gray-700 font-bold text-[10px]">
                <span>${grpName}</span>
                <i class="fas ${icon} mt-2"></i>
            </div>`;
				headerRow.appendChild(thGroup);

				if (!isCollapsed) {
					srcGroups[grpName].forEach(src => {
						const th = document.createElement('th');
						th.className = 'sticky-top';
						th.innerHTML = `<div class="vertical-header"><span class="text-xs font-semibold text-gray-600 hover:text-blue-600 cursor-default" title="${src.display_label}${src.custom_label ? ` (NMOS: ${src.label})` : ``}">${src.display_label}</span></div>`;
						headerRow.appendChild(th);
					});
				}
			});

			thead.appendChild(headerRow);
			table.appendChild(thead);

			const tbody = document.createElement('tbody');

			destGroupNames.forEach(grpName => {
				const isDestCollapsed = collapsedGroups.destinations[grpName];

				const trGroup = document.createElement('tr');

				const thGroup = document.createElement('th');
				thGroup.className = 'sticky-left group-header text-xs text-gray-700';
				thGroup.onclick = () => toggleGroup('dest', grpName);
				const iconRow = isDestCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';
				thGroup.innerHTML = `<div class="flex justify-between items-center px-2"><span>${grpName}</span> <i class="fas ${iconRow} text-[10px]"></i></div>`;
				trGroup.appendChild(thGroup);

				srcGroupNames.forEach(srcGrpName => {
					const tdCross = document.createElement('td');
					tdCross.className = 'separator-row separator-cross';
					trGroup.appendChild(tdCross);

					if (!collapsedGroups.sources[srcGrpName]) {
						srcGroups[srcGrpName].forEach(() => {
							const tdSep = document.createElement('td');
							tdSep.className = 'separator-row';
							trGroup.appendChild(tdSep);
						});
					}
				});
				tbody.appendChild(trGroup);

				if (!isDestCollapsed) {
					destGroups[grpName].forEach(dest => {
						const tr = document.createElement('tr');

						const th = document.createElement('th');
						th.className = 'sticky-left px-3 py-1 text-xs font-medium text-gray-700 text-left truncate h-8 border-r bg-white';
						th.innerText = dest.display_label;
						th.title = dest.custom_label ? (dest.display_label + " (NMOS: " + dest.label + ")") : dest.display_label;
						tr.appendChild(th);

						srcGroupNames.forEach(srcGrpName => {
							const isSrcCollapsed = collapsedGroups.sources[srcGrpName];

							const tdSep = document.createElement('td');
							tdSep.className = 'separator-col';
							tr.appendChild(tdSep);

							if (!isSrcCollapsed) {
								srcGroups[srcGrpName].forEach(src => {
									const td = document.createElement('td');
									const isConnected = activeConnections[dest.id] === src.id;
									td.className = `cell-btn text-center cursor-pointer relative ${isConnected ? 'connected' : ''}`;
									td.innerHTML = isConnected
										? '<div class="w-2 h-2 bg-white mx-auto rounded-sm"></div>'
										: '<div class="empty-dot"></div>';
									td.onclick = () => commutation(src.id, dest.id);
									tr.appendChild(td);
								});
							}
						});

						tbody.appendChild(tr);
					});
				}
			});

			table.appendChild(tbody);

			// Ne restaurer la sélection que pour les champs de recherche texte
			if (activeId === 'inputSrc' || activeId === 'inputDest') {
				const el = document.getElementById(activeId);
				if (el && typeof el.setSelectionRange === 'function') {
					el.focus();
					el.setSelectionRange(selectionStart, selectionEnd);
				}
			}
		}

		function logToConsole(msg, highlight = false) {
			const consoleEl = document.getElementById('consoleLog');
			const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
			const entry = document.createElement('div');
			entry.className = highlight ? 'text-yellow-300' : 'text-gray-400';
			entry.innerHTML = `<span class="text-gray-600">[${time}]</span> <pre>${msg}</pre>`;
			consoleEl.insertBefore(entry, consoleEl.children[1]);
		}





		document.addEventListener('DOMContentLoaded', async () => {

			// --- Fonction unique de MAJ NMOS ---
			async function runNmosUpdate() {
				const $btn = $("#updateBtn");
				const $icon = $("#updateIcon");
				const $text = $("#updateText");

				// sécurité si bouton pas encore dans le DOM
				const hasBtn = $btn.length && $icon.length && $text.length;

				if (hasBtn) {
					$btn.prop("disabled", true).addClass("opacity-60 cursor-not-allowed");
					$icon.addClass("fa-spin");
					$text.text(t("update_in_progress"));
				}
				logToConsole(t("nmos_update_started"), true);

				try {

					// ---- APPEL AJAX ----
					let res = await $.ajax({
						url: "php/nmos-update.php",
						method: "GET",
						cache: false,
						data: { t: Date.now() },
						timeout: 60000
					});

					// Si le retour est une string → on tente JSON.parse
					if (typeof res === "string") {
						try { res = JSON.parse(res); } catch (e) { }
					}

					// ---- TRAITEMENT RÉSULTAT JSON ----
					if (res && res.ok) {
						const okCount = res.nodes_ok ?? 0;
						const koCount = res.nodes_ko ?? 0;

						if (koCount > 0) {
							logToConsole(t("nmos_update_partial", { ok: okCount, ko: koCount }), true);

							(res.errors || []).forEach(err => {
								logToConsole(
									`${t("node_ko")} (${err.step}) : ${err.node_api} → ${err.error}`,
									true
								);
							});
						} else {
							logToConsole(t("nmos_update_ok", { count: okCount }), true);
						}
					} else {
						logToConsole(t("unexpected_response"), true);
					}

					logToConsole(t("update_complete_reloading"), true);

					// ---- RECHARGER LES JSON ----
					await loadNmosData();

					activeConnections = {};
					destinations.forEach(d => {
						if (d.subscription_active && d.subscription_sender_id) {
							activeConnections[d.id] = d.subscription_sender_id;
						}
					});

					renderGrid();
					logToConsole(t("matrix_reloaded"), true);
					collapseAllGroups();



				} catch (e) {

					// ---- ERREUR GLOBALE ----
					let errMsg = '';
					if (e && e.statusText) {
						errMsg = (e.statusText === 'timeout') ? 'Délai d\'attente dépassé (timeout)' : (e.statusText + (e.status ? ' (HTTP ' + e.status + ')' : ''));
					} else if (e && e.message) {
						errMsg = e.message;
					} else {
						errMsg = String(e);
					}
					logToConsole(t("update_error") + errMsg, true);
					alert(t("nmos_update_error_alert") + errMsg);


				} finally {

					// ---- REMISE À ZÉRO BOUTON + SPINNER ----
					if (hasBtn) {
						$icon.removeClass("fa-spin");
						$text.text(t("nmos_update"));
						$btn.prop("disabled", false).removeClass("opacity-60 cursor-not-allowed");
					}


				}

			}

			try {
				// 1) MAJ au démarrage
				// mise à jour au démarrage désactivée
				//await runNmosUpdate();

				// chargement du tableau
				await loadNmosData();

				activeConnections = {};
				destinations.forEach(d => {
					if (d.subscription_active && d.subscription_sender_id) {
						activeConnections[d.id] = d.subscription_sender_id;
					}
				});

				renderGrid();
				logToConsole(t("matrix_reloaded"), true);
				collapseAllGroups();
				// fin chargement





				logToConsole(
					t("real_nmos_state_synced", { count: Object.keys(activeConnections).length }),
					true
				);


				// 2) Installation des listeners UI
				const mediaSelect = document.getElementById("mediaSelect");
				if (mediaSelect) {
					mediaSelect.value = currentMediaFilter;
					changeType();
					mediaSelect.addEventListener("change", () => {
						currentMediaFilter = mediaSelect.value;
						changeType();

						if (currentMediaFilter === "virtual") {
							renderGridVirtual();
						} else {
							renderGrid();
						}



						logToConsole(t("media_filter") + `: ${currentMediaFilter}`, true);
					});
				}

				const toggleLabs = document.getElementById("toggleLabs");
				if (toggleLabs) {
					toggleLabs.checked = showOnlyLabs;
					toggleLabs.addEventListener("change", () => {
						showOnlyLabs = toggleLabs.checked;
						renderGrid();
						logToConsole(t("custom_labels_filter") + `: ${showOnlyLabs ? "ON" : "OFF"}`, true);
					});
				}

				const toggleActive = document.getElementById("toggleActive");
				if (toggleActive) {
					toggleActive.checked = showOnlyActive;
					toggleActive.addEventListener("change", () => {
						showOnlyActive = toggleActive.checked;
						renderGrid();
						logToConsole(t("active_connections_filter") + `: ${showOnlyActive ? "ON" : "OFF"}`, true);
					});
				}

				// 3) Bouton = même fonction
				$("#updateBtn").on("click", () => runNmosUpdate());

				logToConsole(t("json_loaded_success"), true);

			} catch (e) {
				console.error(e);
				logToConsole(t("json_load_error") + e.message, true);
			}
		});



		/*
		initI18n({ url: "json/i18n.json" });
		setLang("en");
		*/
		initI18n({ url: "json/i18n.json", selectId: "langSelect" });

		window.addEventListener("i18n:changed", () => {
			if (currentMediaFilter === "virtual") {
				renderGridVirtual();
			} else {
				renderGrid();
			}
		});

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



		function updateGroupToggleButtons(areCollapsed) {
			const btnOpen = document.getElementById('btnOpenGroups');
			const btnClose = document.getElementById('btnCloseGroups');
			if (!btnOpen || !btnClose) return;
			if (areCollapsed) {
				btnOpen.classList.remove('hidden');
				btnClose.classList.add('hidden');
			} else {
				btnOpen.classList.add('hidden');
				btnClose.classList.remove('hidden');
			}
		}

		function collapseAllGroups() {
			updateGroupToggleButtons(true);

			if (currentMediaFilter === "virtual") {

				// 1) mêmes préparations que renderGridVirtual()
				const vSrc = prepareVirtual(virtualSources, true);
				const vDst = prepareVirtual(virtualDestinations, false);

				const fs = (filterSrc || "").toLowerCase();
				const fd = (filterDest || "").toLowerCase();

				const vSrcFiltered = vSrc.filter(s =>
					(s.display_label || "").toLowerCase().includes(fs) ||
					(s.equipement || "").toLowerCase().includes(fs)
				);

				const vDstFiltered = vDst.filter(d =>
					(d.display_label || "").toLowerCase().includes(fd) ||
					(d.equipement || "").toLowerCase().includes(fd)
				);

				// 2) groupes = groupBy(..., 'equipement') comme dans renderGridVirtual()
				const srcGroups = groupBy(vSrcFiltered, 'equipement');
				const dstGroups = groupBy(vDstFiltered, 'equipement');

				Object.keys(srcGroups).forEach(g => collapsedGroups.sources[g] = true);
				Object.keys(dstGroups).forEach(g => collapsedGroups.destinations[g] = true);

				renderGridVirtual();
				return;
			}

			// ---- Mode normal (video/audio/data) : on ferme tous les groupes visibles ----
			// NB: on ne refait pas tous les filtres ici, on ferme large (tous connus)
			// Si tu veux "visibles uniquement", je peux te faire la version miroir de renderGrid().
			sources.forEach(s => { collapsedGroups.sources[getGroupName(s)] = true; });
			destinations.forEach(d => { collapsedGroups.destinations[getGroupName(d)] = true; });

			renderGrid();
		}



		function expandAllGroups() {
			updateGroupToggleButtons(false);
			collapsedGroups.sources = {};
			collapsedGroups.destinations = {};

			if (currentMediaFilter === "virtual") {
				renderGridVirtual();
			} else {
				renderGrid();
			}
		}

// Expose functions called directly by inline HTML onclick / onchange handlers
window.changeType = changeType;
window.toggleMenu = toggleMenu;
window.expandAllGroups = expandAllGroups;
window.collapseAllGroups = collapseAllGroups;
window.toogleLog = toogleLog;
window.handleFilterChange = handleFilterChange;

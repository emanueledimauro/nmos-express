/* js/switching.js
   Moteur de commutation NMOS (frontend) — indépendant du HTML
   - NmosSwitching.switchSimple(senderId, receiverId)
   - NmosSwitching.switchVirtual(srcVirtualObjOrId, dstVirtualObjOrId)
   - profils (optionnel) : NmosSwitching.setProfiles(...)
*/
const NmosSwitching = (() => {
  let config = {
    apiSwitchUrl: "php/api_switch.php",
    apiVirtualUrl: "php/api_virtual.php",
    timeoutMs: 5000,
    notifier: null,
    notifyOnSuccess: false
  };

  const CODES = {
    PROFILE_NOT_ALLOWED: "PROFILE_NOT_ALLOWED",
    TIMEOUT: "TIMEOUT",
    NETWORK_ERROR: "NETWORK_ERROR",
    HTTP_ERROR: "HTTP_ERROR",
    BACKEND_ERROR: "BACKEND_ERROR",
    INVALID_RESPONSE: "INVALID_RESPONSE",
    INTERNAL_ERROR: "INTERNAL_ERROR"
  };

  let senderProfiles = {};
  let receiverProfilesAllowed = {};
  let labsSenders = new Set();

  let virtualSourcesCache = null;
  let virtualDestinationsCache = null;

  function tr(key, vars, fallback) {
    if (typeof t === "function") return t(key, vars);
    return fallback;
  }

  function notify(payload) {
    try { if (typeof config.notifier === "function") config.notifier(payload); } catch (e) {}
  }
  function ok(data=null){ return { ok:true, ts:new Date().toISOString(), data }; }
  function fail(code, message, details=null){
    notify({ type:"error", title: tr("sw_title", {}, "Commutation"), message, code, details });
    return { ok:false, ts:new Date().toISOString(), code, message, details };
  }

  async function fetchJsonWithTimeout(url, fetchOptions={}, timeoutMs=5000){
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try{
      const resp = await fetch(url, { ...fetchOptions, signal: controller.signal });
      if(!resp.ok){
        const text = await resp.text().catch(()=> "");
        return { ok:false, httpStatus: resp.status, bodyText: text };
      }
      const data = await resp.json().catch(()=> null);
      if(data === null){
        const text = await resp.text().catch(()=> "");
        return { ok:false, invalidJson:true, bodyText:text };
      }
      return { ok:true, data };
    } finally {
      clearTimeout(t);
    }
  }

  function configure(opts={}){ config = { ...config, ...opts }; }

  function setProfiles({ senders={}, receivers={}, labs=[] } = {}){
    senderProfiles = senders || {};
    receiverProfilesAllowed = receivers || {};
    labsSenders = new Set(Array.isArray(labs) ? labs : []);
  }

  function setVirtualCatalog({ sources = [], destinations = [] } = {}){
    if (Array.isArray(sources) && sources.length) virtualSourcesCache = sources;
    if (Array.isArray(destinations) && destinations.length) virtualDestinationsCache = destinations;
  }

  async function ensureVirtualCatalog(){
    if (!virtualSourcesCache || !virtualDestinationsCache) {
      try {
        const [vsRes, vdRes] = await Promise.all([
          fetchJsonWithTimeout("json/JSON_virtual_sources.json", { cache: "no-store" }, config.timeoutMs),
          fetchJsonWithTimeout("json/JSON_virtual_destinations.json", { cache: "no-store" }, config.timeoutMs)
        ]);
        if (vsRes.ok && Array.isArray(vsRes.data)) virtualSourcesCache = vsRes.data;
        if (vdRes.ok && Array.isArray(vdRes.data)) virtualDestinationsCache = vdRes.data;
      } catch (e) {
        console.warn("[NmosSwitching] Error loading virtual catalog:", e);
      }
    }
    return {
      sources: virtualSourcesCache || [],
      destinations: virtualDestinationsCache || []
    };
  }

  function needProfileCheck(senderId, receiverId){
    return labsSenders.has(senderId) && Object.prototype.hasOwnProperty.call(receiverProfilesAllowed, receiverId);
  }

  function isProfileCompatible(senderId, receiverId){
    if(!needProfileCheck(senderId, receiverId)) return true;
    const allowed = receiverProfilesAllowed[receiverId];
    if(!allowed || allowed === "*") return true;
    const senderProfile = senderProfiles[senderId] || null;
    if(!senderProfile) return false;
    if(Array.isArray(allowed)) return allowed.includes(senderProfile);
    return true;
  }

  async function switchSimple(senderId, receiverId){
    try{
      if(!senderId || !receiverId){
        return fail(CODES.INTERNAL_ERROR, tr("sw_err_missing_ids", {}, "senderId ou receiverId manquant"), { senderId, receiverId });
      }
      if(!isProfileCompatible(senderId, receiverId)){
        const senderProfile = senderProfiles[senderId] || tr("sw_no_profile", {}, "(aucun profil)");
        const allowed = receiverProfilesAllowed[receiverId];
        return fail(CODES.PROFILE_NOT_ALLOWED, tr("sw_err_profile_not_allowed", {}, "Commutation refusée : profil non autorisé"), { senderId, receiverId, senderProfile, allowed });
      }

      const res = await fetchJsonWithTimeout(
        config.apiSwitchUrl,
        { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ sender_id: senderId, receiver_id: receiverId }) },
        config.timeoutMs
      );

      if(!res.ok){
        if(res.httpStatus) return fail(CODES.HTTP_ERROR, tr("sw_err_http", { status: res.httpStatus }, "Erreur HTTP " + res.httpStatus), { senderId, receiverId, body: res.bodyText || "" });
        if(res.invalidJson) return fail(CODES.INVALID_RESPONSE, tr("sw_err_invalid_json", {}, "Réponse invalide (JSON attendu)"), { senderId, receiverId, body: res.bodyText || "" });
        return fail(CODES.NETWORK_ERROR, tr("sw_err_network", {}, "Erreur réseau"), { senderId, receiverId, raw: res });
      }

      const data = res.data;
      if(!data || typeof data.ok === "undefined"){
        return fail(CODES.INVALID_RESPONSE, tr("sw_err_unexpected_backend", {}, "Réponse backend inattendue"), { senderId, receiverId, body: data });
      }
      if(!data.ok){
        return fail(CODES.BACKEND_ERROR, data.error || tr("sw_err_nmos_failed", {}, "Commutation NMOS échouée"), { senderId, receiverId, backend: data });
      }

      if(config.notifyOnSuccess){
        notify({ type:"success", title: tr("sw_title", {}, "Commutation"), message:"Switch OK", code:"OK", details:{ senderId, receiverId } });
      }
      return ok(data);
    }catch(e){
      if(e && (e.name === "AbortError" || String(e).includes("AbortError"))){
        return fail(CODES.TIMEOUT, tr("sw_err_timeout", { ms: config.timeoutMs }, "Timeout (" + config.timeoutMs + " ms)"), { senderId, receiverId });
      }
      return fail(CODES.NETWORK_ERROR, tr("sw_err_network_fetch", {}, "Erreur réseau (fetch)"), { senderId, receiverId, error: String(e) });
    }
  }

  async function switchVirtual(src, dst){
    try{
      if(!src || !dst){
        return fail(CODES.INTERNAL_ERROR, tr("sw_err_missing_ids", {}, "Source ou destination manquante"), { src, dst });
      }

      const { sources, destinations } = await ensureVirtualCatalog();

      // Résolution source
      let srcObj = (typeof src === "object" && src !== null) ? src : null;
      if (!srcObj && typeof src === "string") {
        srcObj = sources.find(s => s.id === src || s.label === src) || null;
      }

      // Résolution destination
      let dstObj = (typeof dst === "object" && dst !== null) ? dst : null;
      if (!dstObj && typeof dst === "string") {
        dstObj = destinations.find(d => d.id === dst || d.label === dst) || null;
      }

      // Compatibilité descendante (ex: ancien workflow contenant directement des UUIDs physiques NMOS)
      if (!srcObj && !dstObj && typeof src === "string" && typeof dst === "string") {
        return await switchSimple(src, dst);
      }

      if (!srcObj || !dstObj) {
        return fail(
          CODES.INTERNAL_ERROR,
          tr("sw_err_virtual_not_found", {}, "Équipement virtuel introuvable"),
          { src, dst, srcFound: !!srcObj, dstFound: !!dstObj }
        );
      }

      const canV = !!(srcObj.video_sender && dstObj.video_receiver);
      const canA = !!(srcObj.audio_sender && dstObj.audio_receiver);
      const canD = !!(srcObj.data_sender && dstObj.data_receiver);

      const subResults = [];
      let anyOk = false;

      // Commutations des flux NMOS réels
      if (canV) {
        const resV = await switchSimple(srcObj.video_sender, dstObj.video_receiver);
        subResults.push({ media: "video", ok: resV.ok, res: resV });
        if (resV.ok) anyOk = true;
      }
      if (canA) {
        const resA = await switchSimple(srcObj.audio_sender, dstObj.audio_receiver);
        subResults.push({ media: "audio", ok: resA.ok, res: resA });
        if (resA.ok) anyOk = true;
      }
      if (canD) {
        const resD = await switchSimple(srcObj.data_sender, dstObj.data_receiver);
        subResults.push({ media: "data", ok: resD.ok, res: resD });
        if (resD.ok) anyOk = true;
      }

      // Enregistrement de la connexion virtuelle
      try {
        await fetchJsonWithTimeout(
          config.apiVirtualUrl + "?action=save_connection&type=destinations",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dest_id: dstObj.id,
              virtual_sender_id: srcObj.id
            })
          },
          config.timeoutMs
        );
        // Mise à jour de l'objet destination en cache
        const targetDst = destinations.find(d => d.id === dstObj.id);
        if (targetDst) {
          targetDst.virtual_sender_id = srcObj.id;
        }
      } catch (e) {
        console.warn("[NmosSwitching] Error saving virtual connection:", e);
      }

      const failed = subResults.filter(r => !r.ok);
      if (subResults.length > 0 && failed.length === subResults.length) {
        const firstFail = failed[0].res;
        return fail(firstFail.code || CODES.BACKEND_ERROR, firstFail.message || "Commutation virtuelle échouée", { src: srcObj.id, dst: dstObj.id, subResults });
      }

      if(config.notifyOnSuccess){
        notify({ type:"success", title: tr("sw_title", {}, "Commutation"), message:"Switch Virtual OK", code:"OK", details:{ src: srcObj.id, dst: dstObj.id } });
      }

      return ok({ src: srcObj.id, dst: dstObj.id, subResults });
    }catch(e){
      if(e && (e.name === "AbortError" || String(e).includes("AbortError"))){
        return fail(CODES.TIMEOUT, tr("sw_err_timeout", { ms: config.timeoutMs }, "Timeout (" + config.timeoutMs + " ms)"), { src, dst });
      }
      return fail(CODES.NETWORK_ERROR, tr("sw_err_network_fetch", {}, "Erreur réseau (fetch)"), { src, dst, error: String(e) });
    }
  }

  return { CODES, configure, setProfiles, setVirtualCatalog, switchSimple, switchVirtual };
})();

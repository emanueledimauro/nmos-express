/* js/switching.js
   Moteur de commutation NMOS (frontend) — indépendant du HTML
   - NmosSwitching.switchSimple(senderId, receiverId)
   - NmosSwitching.switchVirtual(srcVirtualObj, dstVirtualObj)
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
    // optionnel : même logique que ta page virtual/index, garde pour plus tard
    return fail(CODES.INTERNAL_ERROR, "switchVirtual non implémenté dans cette version", { src, dst });
  }

  return { CODES, configure, setProfiles, switchSimple, switchVirtual };
})();
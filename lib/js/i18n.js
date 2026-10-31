// i18n.js — kit minimal (no deps)
const I18N = {
    data: null,
    lang: localStorage.getItem("lang") || "fr",
    fallbackLang: "en",
    missingKeys: new Set(),
    debug: true
};

function getLang() {
    return I18N.lang;
}

function setLang(lang) {
    I18N.lang = lang;
    localStorage.setItem("lang", lang);
    if (document.documentElement) {
        document.documentElement.lang = lang;
    }
    applyI18n(document);
    window.dispatchEvent(new CustomEvent("i18n:changed", { detail: { lang } }));
}

/** t("key", {name:"Bob"}) */
function t(key, vars = {}) {
    const d = I18N.data;
    if (!d) return key;

    const langBlock = d[I18N.lang] || {};
    const fbBlock = d[I18N.fallbackLang] || {};
    let s = langBlock[key];

    if (s == null) s = fbBlock[key];
    if (s == null) {
        if (!I18N.missingKeys.has(key) && I18N.debug) {
            I18N.missingKeys.add(key);
            console.warn(`[i18n] missing key: "${key}" (lang=${I18N.lang})`);
        }
        return key;
    }

    return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

/** Applique les textes sur tous les éléments data-i18n* */
function applyI18n(root = document) {
    // Texte
    root.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        // Permet data-i18n-vars='{"name":"x"}' (optionnel)
        const varsRaw = el.getAttribute("data-i18n-vars");
        let vars = {};
        if (varsRaw) {
            try { vars = JSON.parse(varsRaw); } catch { }
        }
        el.textContent = t(key, vars);
    });

    // HTML (pour les textes contenant des balises comme <b>)
    root.querySelectorAll("[data-i18n-html]").forEach(el => {
        const key = el.getAttribute("data-i18n-html");
        const varsRaw = el.getAttribute("data-i18n-vars");
        let vars = {};
        if (varsRaw) {
            try { vars = JSON.parse(varsRaw); } catch { }
        }
        el.innerHTML = t(key, vars);
    });

    // Title
    root.querySelectorAll("[data-i18n-title]").forEach(el => {
        el.title = t(el.getAttribute("data-i18n-title"));
    });

    // Placeholder
    root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
        el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });

    // Optionnel: label d’un sélecteur langue si présent
    const langLabel = root.querySelector("[data-i18n-lang-label]");
    if (langLabel) langLabel.textContent = t("language");
}

/** Charge i18n.json (avec cache-busting optionnel) */
async function loadI18n(url = "json/i18n.json") {
    const r = await fetch(url, { cache: "no-store" }); // pour éviter cache en dev
    if (!r.ok) throw new Error(`i18n fetch failed: ${r.status}`);
    I18N.data = await r.json();
}

/** Initialise : load + apply + hook du sélecteur */
async function initI18n({ url = "json/i18n.json", selectId = "langSelect" } = {}) {
    await loadI18n(url);
    if (document.documentElement) {
        document.documentElement.lang = I18N.lang;
    }
    applyI18n(document);

    const sel = document.getElementById(selectId);
    if (sel) {
        sel.value = I18N.lang;
        sel.addEventListener("change", () => setLang(sel.value));
    }

    if (I18N.debug && I18N.data?._meta) {
        console.log("[i18n] loaded", I18N.data._meta, "lang=", I18N.lang);
    }
}

/** Helper: à appeler après tout re-render dynamique */
function i18nAfterRender(container = document) {
    applyI18n(container);
}

/**
 * NMOS Express - Global Navigation Menu Component (menu.js)
 */

let menuLoadedPromise = null;

function loadMenu(targetSelector = '#menuContainer') {
    if (menuLoadedPromise) return menuLoadedPromise;

    menuLoadedPromise = (async () => {
        const container = document.querySelector(targetSelector);
        if (!container) return;

        try {
            const res = await fetch('menu.html');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            container.innerHTML = await res.text();

            // Highlight active page
            const currentPath = window.location.pathname.split('/').pop() || 'index.html';
            container.querySelectorAll('a[href]').forEach(a => {
                const href = a.getAttribute('href');
                if (href === currentPath || (currentPath === '' && href === 'index.html')) {
                    const parentBtn = a.closest('button');
                    if (parentBtn && parentBtn.id !== 'panelBtn') {
                        parentBtn.classList.remove('bg-blue-100', 'hover:bg-blue-300');
                        parentBtn.classList.add('bg-blue-600', 'text-white', 'hover:bg-blue-700', 'font-semibold');
                        a.classList.remove('text-gray-800', 'hover:text-gray-800');
                        a.classList.add('text-white', 'hover:text-white');
                    }
                }
            });

            // Connect langSelect with I18N
            const langSelect = container.querySelector('#langSelect');
            if (langSelect) {
                if (typeof I18N !== 'undefined' && I18N.lang) {
                    langSelect.value = I18N.lang;
                }
                langSelect.addEventListener('change', () => {
                    if (typeof setLang === 'function') {
                        setLang(langSelect.value);
                    }
                });
            }

            // Apply translations if i18n is available
            if (typeof applyI18n === 'function') {
                applyI18n(container);
            }
        } catch (err) {
            console.error('[Menu] Failed to load menu.html:', err);
        }
    })();

    return menuLoadedPromise;
}

function toggleMenu() {
    const menu = document.getElementById('dropdownMenu');
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

function ensureAboutModal() {
    if (document.getElementById('aboutModalOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'aboutModalOverlay';
    overlay.className = 'hidden fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-200';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-sm w-full p-6 text-center relative overflow-hidden transform transition-all scale-100" onclick="event.stopPropagation()">
            <button type="button" onclick="closeAboutModal()" class="absolute top-3.5 right-3.5 text-gray-400 hover:text-gray-600 focus:outline-none w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                <i class="fas fa-times text-sm"></i>
            </button>

            <!-- Logo -->
            <div class="mb-3 flex justify-center">
                <img src="images/logo-grid.png" alt="NMOS Express" class="h-10 object-contain max-w-[220px]" onerror="this.src='images/logo.png'">
            </div>

            <!-- Version pill -->
            <div class="mb-3">
                <span class="inline-flex items-center gap-1.5 px-3 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span> Version 1.0
                </span>
            </div>

            <!-- Title & subtitle -->
            <h3 class="text-base font-bold text-gray-900 mb-0.5">NMOS Express</h3>
            <p class="text-[11px] text-gray-500 mb-4">SMPTE ST 2110 & AMWA NMOS Control Suite</p>

            <!-- Author & Company card -->
            <div class="bg-slate-50 rounded-xl p-3 mb-4 text-xs text-slate-700 border border-slate-100 space-y-1">
                <div class="text-[10px] uppercase tracking-wider text-slate-400 font-medium" data-i18n="about_developed_by">Développé par</div>
                <div class="font-bold text-slate-900 text-sm">Emanuele Di Mauro</div>
                <div class="text-blue-600 font-semibold text-xs" data-i18n="about_company">Société IIFA Media180</div>
            </div>

            <!-- Standards badges -->
            <div class="flex flex-wrap justify-center gap-1 text-[10px] text-slate-500 mb-4 font-mono">
                <span class="px-2 py-0.5 bg-gray-100 rounded">IS-04</span>
                <span class="px-2 py-0.5 bg-gray-100 rounded">IS-05</span>
                <span class="px-2 py-0.5 bg-gray-100 rounded">ST 2110-20/30/40</span>
                <span class="px-2 py-0.5 bg-gray-100 rounded">Offline-First</span>
            </div>

            <!-- Copyright -->
            <p class="text-[10px] text-slate-400 mb-4 leading-relaxed">
                © 2026 Emanuele Di Mauro — IIFA Media180<br>
                Licence MIT • Tous droits réservés
            </p>

            <!-- Close button -->
            <button type="button" onclick="closeAboutModal()" class="w-full py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-xs rounded-lg transition-colors shadow-sm" data-i18n="about_close">
                Fermer
            </button>
        </div>
    `;

    // Click outside card closes modal
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeAboutModal();
        }
    });

    document.body.appendChild(overlay);

    if (typeof applyI18n === 'function') {
        applyI18n(overlay);
    }
}

function openAboutModal() {
    // Close dropdown menu if open
    const menu = document.getElementById('dropdownMenu');
    if (menu) menu.classList.add('hidden');

    ensureAboutModal();
    const overlay = document.getElementById('aboutModalOverlay');
    if (overlay) {
        if (typeof applyI18n === 'function') {
            applyI18n(overlay);
        }
        overlay.classList.remove('hidden');
    }
}

function closeAboutModal() {
    const overlay = document.getElementById('aboutModalOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// Escape key to close about modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAboutModal();
    }
});

// Close menu when clicking outside
document.addEventListener('click', function (event) {
    const menu = document.getElementById('dropdownMenu');
    const btn = document.getElementById('menuBtn');
    if (menu && btn && !menu.contains(event.target) && !btn.contains(event.target)) {
        menu.classList.add('hidden');
    }
});

// Sync langSelect when language changes globally
window.addEventListener('i18n:changed', (e) => {
    const langSelect = document.getElementById('langSelect');
    if (langSelect && e.detail && e.detail.lang) {
        langSelect.value = e.detail.lang;
    }
});

// Auto load menu on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadMenu());
} else {
    loadMenu();
}

window.loadMenu = loadMenu;
window.toggleMenu = toggleMenu;
window.openAboutModal = openAboutModal;
window.closeAboutModal = closeAboutModal;

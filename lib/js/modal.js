/**
 * NMOS Express - Global Modal & Toast Component (modal.js)
 * ---------------------------------------------------------
 * Remplaçant moderne et élégant pour alert() et confirm().
 * S'injecte automatiquement dans n'importe quelle page HTML.
 */

(function () {
    let modalOverlay = null;
    let toastContainer = null;
    let activeResolver = null;

    function tr(key, fallback) {
        if (typeof window.t === 'function') {
            const val = window.t(key);
            if (val && val !== key) return val;
        }
        return fallback;
    }

    function ensureDOMElements() {
        if (!modalOverlay && document.body) {
            modalOverlay = document.createElement('div');
            modalOverlay.id = 'nmosModalOverlay';
            modalOverlay.className = 'nmos-modal-overlay';
            modalOverlay.setAttribute('role', 'dialog');
            modalOverlay.setAttribute('aria-modal', 'true');
            modalOverlay.innerHTML = `
                <div class="nmos-modal-card">
                    <div class="nmos-modal-header">
                        <div id="nmosModalIconBadge" class="nmos-modal-icon-badge">
                            <i id="nmosModalIcon" class="fas fa-info-circle"></i>
                        </div>
                        <div class="nmos-modal-header-content">
                            <h3 id="nmosModalTitle" class="nmos-modal-title">Titre</h3>
                        </div>
                        <button id="nmosModalCloseBtn" class="nmos-modal-close-btn" title="Fermer">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="nmos-modal-body">
                        <p id="nmosModalMessage" class="nmos-modal-message"></p>
                    </div>
                    <div class="nmos-modal-footer">
                        <button id="nmosModalCancelBtn" class="nmos-modal-btn nmos-modal-btn-secondary" style="display: none;"></button>
                        <button id="nmosModalOkBtn" class="nmos-modal-btn nmos-modal-btn-primary"></button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalOverlay);

            // Événements de fermeture
            const closeBtn = document.getElementById('nmosModalCloseBtn');
            const cancelBtn = document.getElementById('nmosModalCancelBtn');
            const okBtn = document.getElementById('nmosModalOkBtn');

            closeBtn.addEventListener('click', () => closeModal(false));
            cancelBtn.addEventListener('click', () => closeModal(false));
            okBtn.addEventListener('click', () => closeModal(true));

            // Fermeture clic en dehors de la carte
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    closeModal(false);
                }
            });

            // Touches clavier (Échap / Entrée)
            document.addEventListener('keydown', (e) => {
                if (!modalOverlay.classList.contains('active')) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeModal(false);
                } else if (e.key === 'Enter') {
                    // Si le focus n'est pas sur le bouton cancel
                    if (document.activeElement !== cancelBtn) {
                        e.preventDefault();
                        closeModal(true);
                    }
                }
            });
        }

        if (!toastContainer && document.body) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'nmosToastContainer';
            toastContainer.className = 'nmos-toast-container';
            document.body.appendChild(toastContainer);
        }
    }

    function closeModal(result) {
        if (!modalOverlay) return;
        modalOverlay.classList.remove('active');
        if (typeof activeResolver === 'function') {
            const res = activeResolver;
            activeResolver = null;
            res(result);
        }
    }

    /**
     * Affiche une boîte modale d'alerte élégante
     * @param {string} message - Message principal
     * @param {string} type - 'error' | 'warning' | 'info' | 'success'
     * @param {string} [title] - Titre optionnel (sinon calculé par défaut selon le type)
     * @returns {Promise<boolean>}
     */
    function showModalAlert(message, type = 'error', title = null) {
        ensureDOMElements();

        return new Promise((resolve) => {
            activeResolver = resolve;

            const iconBadge = document.getElementById('nmosModalIconBadge');
            const icon = document.getElementById('nmosModalIcon');
            const titleEl = document.getElementById('nmosModalTitle');
            const msgEl = document.getElementById('nmosModalMessage');
            const okBtn = document.getElementById('nmosModalOkBtn');
            const cancelBtn = document.getElementById('nmosModalCancelBtn');

            // Reset classes
            modalOverlay.className = `nmos-modal-overlay nmos-theme-${type}`;

            // Config icônes et titres par défaut
            let defaultTitle = tr('modal_title_info', 'Information');
            let iconClass = 'fas fa-info-circle';

            if (type === 'error' || type === 'danger') {
                defaultTitle = tr('modal_title_error', 'Erreur');
                iconClass = 'fas fa-exclamation-circle';
                okBtn.className = 'nmos-modal-btn nmos-modal-btn-danger';
            } else if (type === 'warning') {
                defaultTitle = tr('modal_title_warning', 'Attention');
                iconClass = 'fas fa-exclamation-triangle';
                okBtn.className = 'nmos-modal-btn nmos-modal-btn-primary';
            } else if (type === 'success') {
                defaultTitle = tr('modal_title_success', 'Succès');
                iconClass = 'fas fa-check-circle';
                okBtn.className = 'nmos-modal-btn nmos-modal-btn-primary';
            } else {
                okBtn.className = 'nmos-modal-btn nmos-modal-btn-primary';
            }

            titleEl.textContent = title || defaultTitle;
            msgEl.textContent = String(message || '');
            icon.className = iconClass;

            cancelBtn.style.display = 'none';
            okBtn.textContent = tr('modal_btn_ok', 'OK');

            modalOverlay.classList.add('active');
            okBtn.focus();
        });
    }

    /**
     * Affiche une boîte modale de confirmation (Confirmer / Annuler)
     * @param {string} message - Message de confirmation
     * @param {string} [title] - Titre
     * @param {string} [confirmText] - Libellé bouton confirmation (défaut: "Confirmer")
     * @param {string} [cancelText] - Libellé bouton annulation (défaut: "Annuler")
     * @param {string} [type='danger'] - 'danger' | 'warning' | 'info'
     * @returns {Promise<boolean>} - true si confirmé, false sinon
     */
    function showModalConfirm(message, title = null, confirmText = null, cancelText = null, type = 'danger') {
        ensureDOMElements();

        return new Promise((resolve) => {
            activeResolver = resolve;

            const iconBadge = document.getElementById('nmosModalIconBadge');
            const icon = document.getElementById('nmosModalIcon');
            const titleEl = document.getElementById('nmosModalTitle');
            const msgEl = document.getElementById('nmosModalMessage');
            const okBtn = document.getElementById('nmosModalOkBtn');
            const cancelBtn = document.getElementById('nmosModalCancelBtn');

            modalOverlay.className = `nmos-modal-overlay nmos-theme-${type}`;

            let defaultTitle = tr('modal_title_confirm', 'Confirmation');
            let iconClass = 'fas fa-question-circle';

            if (type === 'danger' || type === 'error') {
                iconClass = 'fas fa-trash-alt';
                okBtn.className = 'nmos-modal-btn nmos-modal-btn-danger';
            } else if (type === 'warning') {
                iconClass = 'fas fa-exclamation-triangle';
                okBtn.className = 'nmos-modal-btn nmos-modal-btn-primary';
            } else {
                okBtn.className = 'nmos-modal-btn nmos-modal-btn-primary';
            }

            titleEl.textContent = title || defaultTitle;
            msgEl.textContent = String(message || '');
            icon.className = iconClass;

            cancelBtn.style.display = 'inline-flex';
            cancelBtn.textContent = cancelText || tr('modal_btn_cancel', 'Annuler');
            okBtn.textContent = confirmText || tr('modal_btn_confirm', 'Confirmer');

            modalOverlay.classList.add('active');
            okBtn.focus();
        });
    }

    /**
     * Affiche une notification Toast flottante
     * @param {string} message - Message
     * @param {string} type - 'info' | 'success' | 'warning' | 'error'
     * @param {number} [duration=3500] - Durée en ms
     */
    function showToast(message, type = 'info', duration = 3500) {
        ensureDOMElements();

        // Support booléen (ex: showToast(msg, false) pour succès, true pour erreur)
        if (typeof type === 'boolean') {
            type = type ? 'error' : 'success';
        }

        const toast = document.createElement('div');
        toast.className = `nmos-toast-item nmos-toast-${type}`;

        let iconClass = 'fas fa-info-circle';
        if (type === 'success') iconClass = 'fas fa-check-circle';
        else if (type === 'warning') iconClass = 'fas fa-exclamation-triangle';
        else if (type === 'error') iconClass = 'fas fa-exclamation-circle';

        toast.innerHTML = `
            <i class="nmos-toast-icon ${iconClass}"></i>
            <div class="nmos-toast-content">${String(message || '')}</div>
            <button class="nmos-toast-close" title="Fermer"><i class="fas fa-times"></i></button>
        `;

        toast.querySelector('.nmos-toast-close').addEventListener('click', () => {
            removeToast(toast);
        });

        toastContainer.appendChild(toast);

        // Force reflow pour animation fluide
        requestAnimationFrame(() => {
            toast.classList.add('active');
        });

        if (duration > 0) {
            setTimeout(() => {
                removeToast(toast);
            }, duration);
        }
    }

    function removeToast(toast) {
        if (!toast || !toast.parentNode) return;
        toast.classList.remove('active');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    // Auto-initialisation au chargement de la page
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureDOMElements);
    } else {
        ensureDOMElements();
    }

    // Exportation globale
    window.showModalAlert = showModalAlert;
    window.showModalConfirm = showModalConfirm;
    window.showToast = showToast;

    // Remplacement transparent de alert() natif
    window.nativeAlert = window.alert;
    window.alert = function (message) {
        // Détection simple si le message ressemble à une erreur ou un succès
        const str = String(message || '');
        let type = 'warning';
        if (str.toLowerCase().includes('erreur') || str.toLowerCase().includes('invalide') || str.toLowerCase().includes('échec') || str.toLowerCase().includes('error') || str.toLowerCase().includes('failed')) {
            type = 'error';
        } else if (str.toLowerCase().includes('succès') || str.toLowerCase().includes('enregistré') || str.toLowerCase().includes('success') || str.toLowerCase().includes('ok')) {
            type = 'success';
        }
        return showModalAlert(str, type);
    };

})();

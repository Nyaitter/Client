/**
 * app.js — Application entry module (refactored).
 *
 * Responsibilities:
 *   1. Load server client limits (connectivity check).
 *   2. Register the Service Worker.
 *   3. Bootstrap event listeners.
 *   4. Trigger session check → router.
 *
 * All screen logic is delegated to modules under ./modules/ and ./screens/.
 */

import { DOM } from './dom.js';
import { setupGlobalEventListeners } from './events.js';
import { router } from './router.js';
import { registerPwaServiceWorker, handlePendingPushNotificationOpen } from './modules/pwa.js';
import { checkSession } from './modules/auth.js';
import { applyInterfaceTheme, applyColorTheme } from './modules/theme.js';
import {
    showAppAlert,
    loadServerClientLimits,
    applyServerInputLimits,
    getServerClientLimits,
    setServerClientLimits,
} from './utils/helpers.js';

export { loadServerClientLimits, applyServerInputLimits, getServerClientLimits, setServerClientLimits };

// ---------------------------------------------------------------------------
// Application bootstrap
// ---------------------------------------------------------------------------

/**
 * Main entry-point called by main.js after the DOM is ready.
 */
export function initApp() {
    // ── Initial theme (prevents flash before user prefs are loaded) ─────────
    applyInterfaceTheme('auto');

    // ── Global event listeners (delegated — attached only once) ─────────────
    setupGlobalEventListeners();

    // ── Hide overlays that are shown during preload ──────────────────────────
    DOM.freezeOverlay?.classList.add('hidden');
    DOM.connectionErrorOverlay?.classList.add('hidden');

    // ── Service Worker registration (non-blocking) ───────────────────────────
    void registerPwaServiceWorker();

    // ── Primary startup sequence ─────────────────────────────────────────────
    void (async () => {
        try {
            // 1. Confirm server is reachable and load input limits.
            const ok = await loadServerClientLimits();
            if (!ok) {
                DOM.loadingOverlay?.classList.add('hidden');
                return;
            }

            // 2. If app was opened via a push notification, handle deep-link first.
            const handledPushOpen = await handlePendingPushNotificationOpen();
            if (!handledPushOpen) {
                // 3. Otherwise perform a normal session check → router().
                await checkSession();
            }
        } catch (err) {
            console.error('[startup] app initialization failed:', err);
            DOM.loadingOverlay?.classList.add('hidden');
            DOM.connectionErrorOverlay?.classList.remove('hidden');
        }
    })();
}

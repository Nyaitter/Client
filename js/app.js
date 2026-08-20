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

import { apiRequest } from './api.js';
import { DOM } from './dom.js';
import { setupGlobalEventListeners } from './events.js';
import { router } from './router.js';
import { registerPwaServiceWorker, handlePendingPushNotificationOpen } from './modules/pwa.js';
import { checkSession } from './modules/auth.js';
import { applyInterfaceTheme, applyColorTheme } from './modules/theme.js';
import { showAppAlert } from './utils/helpers.js';

// ---------------------------------------------------------------------------
// Server client limits (input length caps, feature flags, etc.)
// ---------------------------------------------------------------------------

/** @type {Record<string,any>|null} */
let serverClientLimits = null;

/**
 * Fetch /server/status and populate serverClientLimits.
 * Shows the connection-error overlay on failure.
 * @returns {Promise<boolean>} true on success
 */
export async function loadServerClientLimits() {
    try {
        const { data, error } = await apiRequest('/server/api/status');
        if (error || !data?.client_limits) {
            DOM.connectionErrorOverlay?.classList.remove('hidden');
            return false;
        }
        serverClientLimits = data.client_limits;
        applyServerInputLimits();
        return true;
    } catch (err) {
        console.error('[startup] status request failed:', err);
        DOM.connectionErrorOverlay?.classList.remove('hidden');
        return false;
    }
}

/**
 * Apply server-specified min/maxlength constraints to any element with
 * data-server-input-limit that is currently in the DOM.
 * @param {Element|Document} [root=document]
 */
export function applyServerInputLimits(root = document) {
    const inputLimits = serverClientLimits?.input;
    if (!inputLimits) return;
    const selector = '[data-server-input-limit]';
    const elements = [];
    if (root instanceof Element && root.matches(selector)) elements.push(root);
    if (root?.querySelectorAll) elements.push(...root.querySelectorAll(selector));

    elements.forEach((element) => {
        if (
            !(element instanceof HTMLInputElement) &&
            !(element instanceof HTMLTextAreaElement)
        )
            return;
        const range = normalizeClientInputRange(inputLimits[element.dataset.serverInputLimit]);
        if (!range) return;
        if (range.min === null) element.removeAttribute('minlength');
        else element.minLength = range.min;
        if (range.max === null) element.removeAttribute('maxlength');
        else element.maxLength = range.max;
    });
}

function normalizeClientInputRange(range) {
    if (!range || typeof range !== 'object') return null;
    const min = Number.isInteger(range.min) && range.min >= 0 ? range.min : null;
    const max = Number.isInteger(range.max) && range.max >= 0 ? range.max : null;
    if (min === null && max === null) return null;
    if (min !== null && max !== null && min > max) return null;
    return { min, max };
}

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
        // 1. Confirm server is reachable and load input limits.
        const ok = await loadServerClientLimits();
        if (!ok) return;

        // 2. If app was opened via a push notification, handle deep-link first.
        const handledPushOpen = await handlePendingPushNotificationOpen();
        if (!handledPushOpen) {
            // 3. Otherwise perform a normal session check → router().
            await checkSession();
        }
    })();
}

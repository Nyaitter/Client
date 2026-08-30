/**
 * Shared lifecycle manager for screens.
 *
 * Existing screens can continue to render imperatively while they are being
 * migrated. Each navigation gets an AbortSignal and a cleanup bucket so new
 * controllers can cancel requests and unsubscribe listeners consistently.
 */

let activeScreenId = null;
let activeContext = null;

function createContext(screenId) {
    const controller = new AbortController();
    const cleanups = new Set();

    return {
        screenId,
        signal: controller.signal,
        addCleanup(cleanup) {
            if (typeof cleanup !== 'function') return () => {};
            cleanups.add(cleanup);
            return () => cleanups.delete(cleanup);
        },
        abort() {
            controller.abort();
            for (const cleanup of cleanups) {
                try {
                    cleanup();
                } catch (error) {
                    console.warn(`[screen:${screenId}] cleanup failed`, error);
                }
            }
            cleanups.clear();
        },
    };
}

export function activateScreen(screenId, { restart = false } = {}) {
    if (restart || activeScreenId !== screenId) {
        activeContext?.abort();
        activeContext = createContext(screenId);
        activeScreenId = screenId;
    }

    document.querySelectorAll('.screen').forEach((screen) => {
        screen.classList.toggle('hidden', screen.id !== screenId);
    });
    document.body.dataset.activeScreen = screenId;

    return activeContext;
}

export function showScreenCompat(screenId, showScreenFn) {
    if (typeof showScreenFn === 'function') return showScreenFn(screenId);
    return activateScreen(screenId);
}

export function getActiveScreenId() {
    return activeScreenId;
}

export function getActiveScreenContext() {
    return activeContext;
}

export function onScreenCleanup(cleanup) {
    return activeContext?.addCleanup(cleanup) || (() => {});
}

export function resetScreenManager() {
    activeContext?.abort();
    activeContext = null;
    activeScreenId = null;
}

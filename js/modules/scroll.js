import { getCurrentUser, getCurrentTimelineTab } from '../state.js';
import { scheduleNextFrame } from '../utils/helpers.js';

export const MAX_SAVED_SCROLL_POSITIONS = 50;
// _v1, _v2のようなバージョニングは絶対にしない。
export const SCROLL_STORAGE_KEY = 'nyaitter_scroll_positions_v1'
    .replaceAll('_v1', '')
    .replaceAll('_v2', '');

let activeScrollRouteKey = null;
let pendingScrollSaveTimer = null;
let savedScrollMemory = new Map();

export function getScrollRouteKey(hash = window.location.hash || '#', tab = null) {
    const userScope = getCurrentUser()?.id ?? 'guest';
    const normalizedHash = (!hash || hash === '#') ? '#' : hash;
    if (normalizedHash === '#') {
        const timelineTab = tab || getCurrentTimelineTab() || 'all';
        return `${userScope}:#:${timelineTab}`;
    }
    return `${userScope}:${normalizedHash}`;
}

export function getSavedScrollPositions() {
    try {
        const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
        if (!raw) return new Map(savedScrollMemory);
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return new Map(savedScrollMemory);
        }
        return new Map(Object.entries(parsed));
    } catch (_) {
        return new Map(savedScrollMemory);
    }
}

export function getSavedScrollTargetY(routeKey = getScrollRouteKey()) {
    const positions = getSavedScrollPositions();
    const value = Number(positions.get(routeKey));
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.max(0, Math.floor(value));
}

export async function restoreCachedPagesUntilScrollPosition(
    fetchFn,
    targetY,
    { maxPages = 20, checkInterval = 32 } = {},
) {
    if (typeof fetchFn !== 'function') return;
    if (!Number.isFinite(targetY) || targetY <= 0) return;

    let pageNumber = 0;
    while (pageNumber < maxPages) {
        const currentDocHeight = Math.max(
            document.documentElement.scrollHeight || 0,
            document.body.scrollHeight || 0,
        );
        const viewportHeight = window.innerHeight || 0;
        if (currentDocHeight >= targetY + viewportHeight * 0.5) {
            break;
        }

        const result = await fetchFn(pageNumber, { fromCacheOnly: true });
        if (!result || !result.hasMore || result.count === 0) {
            break;
        }
        pageNumber += 1;
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }
}

export function clearSavedScrollPosition(routeKey = getScrollRouteKey()) {
    const positions = getSavedScrollPositions();
    if (!positions.has(routeKey)) return;
    positions.delete(routeKey);
    savedScrollMemory.delete(routeKey);
    try {
        sessionStorage.setItem(
            SCROLL_STORAGE_KEY,
            JSON.stringify(Object.fromEntries(positions)),
        );
    } catch (_) {}
}

export function saveScrollPosition(targetRouteKey = null) {
    const routeKey = targetRouteKey || activeScrollRouteKey;
    if (!routeKey) return;
    const currentY = Math.max(0, Math.floor(window.scrollY || 0));
    const positions = getSavedScrollPositions();

    if (currentY <= 0) {
        positions.delete(routeKey);
        savedScrollMemory.delete(routeKey);
    } else {
        positions.set(routeKey, currentY);
        savedScrollMemory.set(routeKey, currentY);
    }

    while (positions.size > MAX_SAVED_SCROLL_POSITIONS) {
        const oldest = positions.keys().next().value;
        if (oldest === undefined) break;
        positions.delete(oldest);
        savedScrollMemory.delete(oldest);
    }

    try {
        sessionStorage.setItem(
            SCROLL_STORAGE_KEY,
            JSON.stringify(Object.fromEntries(positions)),
        );
    } catch (_) {}
}

export function scheduleScrollPositionSave() {
    if (pendingScrollSaveTimer) return;
    pendingScrollSaveTimer = setTimeout(() => {
        pendingScrollSaveTimer = null;
        saveScrollPosition();
    }, 150);
}

export function beginScrollRouteTransition() {
    if (activeScrollRouteKey) {
        saveScrollPosition(activeScrollRouteKey);
    }
    activeScrollRouteKey = null;
    if (pendingScrollSaveTimer) {
        clearTimeout(pendingScrollSaveTimer);
        pendingScrollSaveTimer = null;
    }
}

let scrollRestoreVersion = 0;

export function restoreScrollPosition(targetRouteKey = null) {
    const routeKey = targetRouteKey || getScrollRouteKey();
    activeScrollRouteKey = routeKey;
    const targetY = getSavedScrollTargetY(routeKey);
    const version = ++scrollRestoreVersion;

    scheduleNextFrame(() => {
        scheduleNextFrame(() => {
            if (version !== scrollRestoreVersion || activeScrollRouteKey !== routeKey) return;
            window.scrollTo({
                top: targetY,
                left: 0,
                behavior: 'instant',
            });
            if (targetY > 0) {
                scheduleNextFrame(() => {
                    if (version !== scrollRestoreVersion || activeScrollRouteKey !== routeKey) return;
                    if (Math.abs((window.scrollY || 0) - targetY) > 2) {
                        window.scrollTo({
                            top: targetY,
                            left: 0,
                            behavior: 'instant',
                        });
                    }
                });
            }
        });
    });
}

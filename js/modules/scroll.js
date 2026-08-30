import { getCurrentUser, getCurrentTimelineTab } from '../state.js';
import { scheduleNextFrame } from '../utils/helpers.js';

export const MAX_SAVED_SCROLL_POSITIONS = 50;
export const SCROLL_STORAGE_KEY = 'nyaitter_scroll_positions';

let activeScrollRouteKey = null;
let pendingScrollSaveTimer = null;
let savedScrollMemory = new Map();

export function getScrollRouteKey(hash = window.location.hash || '#', tab = null) {
    const userScope = getCurrentUser()?.id ?? 'guest';
    const normalizedHash = (!hash || hash === '#') ? '#' : hash;
    if (normalizedHash === '#') {
        const timelineTab = tab || getCurrentTimelineTab() || 'foryou';
        return `${userScope}:#:${timelineTab}`;
    }
    if (normalizedHash === '#dm' && tab) {
        return `${userScope}:#dm:${tab}`;
    }
    const postActivityMatch = normalizedHash.match(/^#\/?post\/(\d+)\/activity(?:\/([^/]+))?/i);
    if (postActivityMatch) {
        const currentTab = tab || postActivityMatch[2] || 'quotes';
        return `${userScope}:#post/${postActivityMatch[1]}/activity:${currentTab}`;
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

export function saveElementScrollPosition(element, key) {
    if (!element || !key) return;
    const routeKey = `el:${key}`;
    const currentY = Math.max(0, Math.floor(Math.abs(element.scrollTop || 0)));
    const positions = getSavedScrollPositions();
    if (currentY <= 0) {
        positions.delete(routeKey);
        savedScrollMemory.delete(routeKey);
    } else {
        positions.set(routeKey, currentY);
        savedScrollMemory.set(routeKey, currentY);
    }
    try {
        sessionStorage.setItem(
            SCROLL_STORAGE_KEY,
            JSON.stringify(Object.fromEntries(positions)),
        );
    } catch (_) {}
}

export function restoreElementScrollPosition(element, key) {
    if (!element || !key) return;
    const routeKey = `el:${key}`;
    const targetY = getSavedScrollTargetY(routeKey);
    if (targetY > 0) {
        scheduleNextFrame(() => {
            if (element && element.isConnected) {
                element.scrollTop = targetY;
            }
        });
    }
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

    // スクロール位置までページを読みだした後、追加で1ページを読み込む
    try {
        await fetchFn(pageNumber, { fromCacheOnly: true });
    } catch (_) {}
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
    }, 100);
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

export function setSavedScrollPosition(routeKey = getScrollRouteKey(), positionY = 0) {
    if (!routeKey) return;
    const targetY = Math.max(0, Math.floor(Number(positionY) || 0));
    const positions = getSavedScrollPositions();
    positions.set(routeKey, targetY);
    savedScrollMemory.set(routeKey, targetY);
    try {
        sessionStorage.setItem(
            SCROLL_STORAGE_KEY,
            JSON.stringify(Object.fromEntries(positions)),
        );
    } catch (_) {}
}

let scrollRestoreVersion = 0;

export function restoreScrollPosition(targetRouteKey = null) {
    const routeKey = targetRouteKey || getScrollRouteKey();
    activeScrollRouteKey = routeKey;
    const positions = getSavedScrollPositions();
    const hasSavedValue = positions.has(routeKey);
    const targetY = getSavedScrollTargetY(routeKey);
    const version = ++scrollRestoreVersion;

    if (!hasSavedValue || targetY <= 0) {
        if (!hasSavedValue) {
            // SSに値がないときは0にセットして保存
            positions.set(routeKey, 0);
            savedScrollMemory.set(routeKey, 0);
            try {
                sessionStorage.setItem(
                    SCROLL_STORAGE_KEY,
                    JSON.stringify(Object.fromEntries(positions)),
                );
            } catch (_) {}
        }
        window.scrollTo({
            top: 0,
            left: 0,
            behavior: 'instant',
        });
        return;
    }

    // まず同期で即時適用を試行
    window.scrollTo({
        top: targetY,
        left: 0,
        behavior: 'instant',
    });

    // 描画遅延や高さ変動に備えて複数フレームで追従
    const tryScroll = (attemptsLeft = 4) => {
        scheduleNextFrame(() => {
            if (version !== scrollRestoreVersion || activeScrollRouteKey !== routeKey) return;
            if (Math.abs((window.scrollY || 0) - targetY) > 2) {
                window.scrollTo({
                    top: targetY,
                    left: 0,
                    behavior: 'instant',
                });
            }
            if (attemptsLeft > 1 && Math.abs((window.scrollY || 0) - targetY) > 2) {
                setTimeout(() => tryScroll(attemptsLeft - 1), 30);
            }
        });
    };

    tryScroll();
}

// ユーザーがスクロールした際にリアルタイムで最新位置をデバウンス保存
if (typeof window !== 'undefined') {
    window.addEventListener(
        'scroll',
        () => {
            scheduleScrollPositionSave();
        },
        { passive: true },
    );
}

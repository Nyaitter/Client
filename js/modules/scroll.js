import { getCurrentUser, getCurrentTimelineTab } from '../state.js';
import { scheduleNextFrame } from '../utils/helpers.js';

export const MAX_SAVED_SCROLL_POSITIONS = 50;
export const SCROLL_STORAGE_KEY = 'nyaitter_scroll_positions';

let activeScrollRouteKey = null;
let pendingScrollSaveTimer = null;
let savedScrollMemory = new Map();
let scrollRestoreInProgress = false;
let lastObservedScrollY = null;
let activeScrollHash = null;

// scrollY is the persisted visual coordinate. Calibrate scrollTo's input
// coordinate against the browser's measured result instead of assuming they match.
export function scrollWindowTo(visualY) {
    const targetY = Math.max(0, Number(visualY) || 0);
    let inputY = targetY;
    let lastActualY = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        window.scrollTo({ top: inputY, left: 0, behavior: 'instant' });
        const actualY = window.scrollY || 0;
        if (Math.abs(actualY - targetY) <= 2) return actualY;
        if (actualY <= 0 || actualY === lastActualY) return actualY;
        lastActualY = actualY;
        inputY *= targetY / actualY;
        if (!Number.isFinite(inputY) || inputY <= 0) return actualY;
    }
    return window.scrollY || 0;
}

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
        const currentDocHeight = document.documentElement.scrollHeight || 0;
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
    if (scrollRestoreInProgress) return;
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
    if (scrollRestoreInProgress) return;
    if (pendingScrollSaveTimer) return;
    pendingScrollSaveTimer = setTimeout(() => {
        pendingScrollSaveTimer = null;
        saveScrollPosition();
    }, 100);
}

export function beginScrollRouteTransition() {
    scrollRestoreVersion += 1;
    scrollRestoreInProgress = false;
    // hashchange runs after the browser may reset scrollY to 0. Do not let
    // that navigation reset erase the outgoing route's previously saved position.
    if (activeScrollRouteKey) {
        const currentY = window.scrollY || 0;
        if (currentY > 0 || (currentY === 0 && lastObservedScrollY === 0)) {
            saveScrollPosition(activeScrollRouteKey);
        }
    }
    activeScrollRouteKey = null;
    activeScrollHash = null;
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
    activeScrollHash = window.location.hash;
    lastObservedScrollY = null;
    const positions = getSavedScrollPositions();
    const hasSavedValue = positions.has(routeKey);
    const targetY = getSavedScrollTargetY(routeKey);
    const version = ++scrollRestoreVersion;
    scrollRestoreInProgress = targetY > 0;
    if (pendingScrollSaveTimer) {
        clearTimeout(pendingScrollSaveTimer);
        pendingScrollSaveTimer = null;
    }

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
        scrollRestoreInProgress = false;
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        return;
    }

    // まず同期で即時適用を試行
    try {
        scrollWindowTo(targetY);
    } catch (error) {
        if (version === scrollRestoreVersion) scrollRestoreInProgress = false;
        throw error;
    }

    // 描画遅延や画像の読み込み・高さ変動に備えて追従する。固定回数で打ち切ると、
    // 高さが後から伸びた際にブラウザのスクロールアンカリングでずれた位置が
    // そのまま保存されてしまうため、高さと位置が安定するまで適用し直す。
    // 追従中は scrollRestoreInProgress が立ち、ずれた値の保存も抑止される。
    const followDeadline = Date.now() + 3000;
    let lastHeight = -1;
    let stableChecks = 0;
    let userInterrupted = false;
    const markUserInterrupt = () => { userInterrupted = true; };
    window.addEventListener('wheel', markUserInterrupt, { passive: true });
    window.addEventListener('touchstart', markUserInterrupt, { passive: true });
    const removeInterruptListeners = () => {
        window.removeEventListener('wheel', markUserInterrupt);
        window.removeEventListener('touchstart', markUserInterrupt);
    };
    const finishFollowUp = () => {
        removeInterruptListeners();
        if (version === scrollRestoreVersion) scrollRestoreInProgress = false;
    };
    const tryScroll = () => {
        try {
            scheduleNextFrame(() => {
                if (version !== scrollRestoreVersion || activeScrollRouteKey !== routeKey) {
                    removeInterruptListeners();
                    return;
                }
                try {
                    if (userInterrupted) {
                        finishFollowUp();
                        return;
                    }
                    const currentY = window.scrollY || 0;
                    if (Math.abs(currentY - targetY) > 2) {
                        scrollWindowTo(targetY);
                    }
                    const height = document.documentElement.scrollHeight || 0;
                    const settled = Math.abs((window.scrollY || 0) - targetY) <= 2;
                    if (settled && height === lastHeight) {
                        stableChecks += 1;
                    } else {
                        stableChecks = 0;
                        lastHeight = height;
                    }
                    if (stableChecks >= 3 || Date.now() >= followDeadline) {
                        finishFollowUp();
                    } else {
                        setTimeout(tryScroll, 30);
                    }
                } catch (error) {
                    finishFollowUp();
                    throw error;
                }
            });
        } catch (error) {
            finishFollowUp();
            throw error;
        }
    };

    tryScroll();
}

// ユーザーがスクロールした際にリアルタイムで最新位置をデバウンス保存
if (typeof window !== 'undefined') {
    window.addEventListener(
        'scroll',
        () => {
            // A hash navigation can reset scroll before the router runs.
            // That event belongs to neither the outgoing route nor its save timer.
            if (!activeScrollRouteKey || window.location.hash !== activeScrollHash) return;
            lastObservedScrollY = window.scrollY || 0;
            scheduleScrollPositionSave();
        },
        { passive: true },
    );
}

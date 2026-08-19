import {
    getAllUsersCache,
    getCurrentUser,
    getCurrentTimelineTab,
    getRealtimeChannel,
} from '../state.js';

export const MAX_USER_CACHE_LIMIT = 800;
export const MAX_TIMELINE_PAGE_CACHES = 30;
export const MAX_PROFILE_POST_PAGE_CACHES = 30;
export const MAX_AUXILIARY_PAGE_CACHES = 50;
export const MAX_SCREEN_DATA_CACHES = 50;
// _v1, _v2のようなバージョニングは絶対にしない。
export const PAGE_CACHE_STORAGE_KEY = 'nyaitter_page_cache_v2'
    .replaceAll('_v1', '')
    .replaceAll('_v2', '');

export const timelinePageCaches = new Map();
export const profilePostPageCaches = new Map();
export const auxiliaryPostPageCaches = new Map();
export const userPageCaches = new Map();
export const screenDataCaches = new Map();

export const pendingRealtimeTimelineUpdates = {
    foryou: [],
    following: [],
};

export function trimPageCacheMap(cacheMap, limit) {
    while (cacheMap.size > limit) {
        const oldestKey = cacheMap.keys().next().value;
        if (oldestKey === undefined) break;
        cacheMap.delete(oldestKey);
    }
}

export function serializePostPageCache(pageCache) {
    return { pages: Array.from(pageCache?.pages?.entries?.() || []) };
}

export function restorePostPageCache(serializedCache) {
    const pages = new Map();
    if (Array.isArray(serializedCache?.pages)) {
        serializedCache.pages.forEach(([pageNumber, payload]) => {
            const normalizedPageNumber = Number(pageNumber);
            if (
                Number.isInteger(normalizedPageNumber) &&
                normalizedPageNumber >= 0 &&
                payload &&
                typeof payload === 'object'
            )
                pages.set(normalizedPageNumber, payload);
        });
    }
    return { pages };
}

let persistScheduled = false;
let persistTimer = null;

function doPersistPageCaches() {
    persistScheduled = false;
    try {
        const timelineCaches = Array.from(timelinePageCaches.entries()).map(
            ([pageKey, pageCache]) => [
                pageKey,
                {
                    timelines: Array.from(
                        pageCache.timelines.entries(),
                    ).map(([tab, tabCache]) => [
                        tab,
                        serializePostPageCache(tabCache),
                    ]),
                },
            ],
        );
        const profileCaches = Array.from(
            profilePostPageCaches.entries(),
        ).map(([pageKey, pageCache]) => [
            pageKey,
            serializePostPageCache(pageCache),
        ]);
        const auxiliaryPostCaches = Array.from(
            auxiliaryPostPageCaches.entries(),
        ).map(([pageKey, pageCache]) => [
            pageKey,
            serializePostPageCache(pageCache),
        ]);
        const userCaches = Array.from(userPageCaches.entries()).map(
            ([pageKey, pageCache]) => [
                pageKey,
                serializePostPageCache(pageCache),
            ],
        );
        const screenData = Array.from(screenDataCaches.entries());
        sessionStorage.setItem(
            PAGE_CACHE_STORAGE_KEY,
            JSON.stringify({
                timelineCaches,
                profileCaches,
                auxiliaryPostCaches,
                userCaches,
                screenData,
            }),
        );
    } catch (_) {
        // Continue using in-memory cache if sessionStorage is full or unavailable
    }
}

/**
 * Debounced persistence using requestIdleCallback or setTimeout
 * to eliminate main-thread freezing and memory spikes during scrolling.
 */
export function persistPageCaches() {
    if (persistScheduled) return;
    persistScheduled = true;
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => doPersistPageCaches(), { timeout: 1000 });
    } else {
        clearTimeout(persistTimer);
        persistTimer = setTimeout(doPersistPageCaches, 300);
    }
}

export function restorePageCaches() {
    try {
        const stored = sessionStorage.getItem(PAGE_CACHE_STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (!parsed || typeof parsed !== 'object') return;

        if (Array.isArray(parsed.timelineCaches)) {
            parsed.timelineCaches.forEach(([pageKey, pageCache]) => {
                if (typeof pageKey !== 'string' || !pageCache) return;
                const timelines = new Map();
                if (Array.isArray(pageCache.timelines)) {
                    pageCache.timelines.forEach(([tab, tabCache]) => {
                        if (typeof tab === 'string') {
                            timelines.set(tab, restorePostPageCache(tabCache));
                        }
                    });
                }
                timelinePageCaches.set(pageKey, { timelines });
            });
            trimPageCacheMap(timelinePageCaches, MAX_TIMELINE_PAGE_CACHES);
        }

        if (Array.isArray(parsed.profileCaches)) {
            parsed.profileCaches.forEach(([pageKey, pageCache]) => {
                if (typeof pageKey !== 'string') return;
                profilePostPageCaches.set(
                    pageKey,
                    restorePostPageCache(pageCache),
                );
            });
            trimPageCacheMap(
                profilePostPageCaches,
                MAX_PROFILE_POST_PAGE_CACHES,
            );
        }

        if (Array.isArray(parsed.auxiliaryPostCaches)) {
            parsed.auxiliaryPostCaches.forEach(([pageKey, pageCache]) => {
                if (typeof pageKey !== 'string') return;
                auxiliaryPostPageCaches.set(
                    pageKey,
                    restorePostPageCache(pageCache),
                );
            });
            trimPageCacheMap(
                auxiliaryPostPageCaches,
                MAX_AUXILIARY_PAGE_CACHES,
            );
        }

        if (Array.isArray(parsed.userCaches)) {
            parsed.userCaches.forEach(([pageKey, pageCache]) => {
                if (typeof pageKey !== 'string') return;
                userPageCaches.set(pageKey, restorePostPageCache(pageCache));
            });
            trimPageCacheMap(userPageCaches, MAX_AUXILIARY_PAGE_CACHES);
        }

        if (Array.isArray(parsed.screenData)) {
            parsed.screenData.forEach(([key, value]) => {
                if (typeof key === 'string' && value) {
                    screenDataCaches.set(key, value);
                }
            });
            trimPageCacheMap(screenDataCaches, MAX_SCREEN_DATA_CACHES);
        }
    } catch (_) {
        // If restoring fails, keep clean in-memory state
    }
}

export function hasSameUserId(left, right) {
    const leftId = Number(left?.id ?? left);
    const rightId = Number(right?.id ?? right);
    return (
        Number.isInteger(leftId) &&
        Number.isInteger(rightId) &&
        leftId >= 0 &&
        leftId === rightId
    );
}

export function isCurrentUserProfile(user) {
    return hasSameUserId(user, getCurrentUser());
}

export function userIdListIncludes(userList, userId) {
    const targetId = Number(userId?.id ?? userId);
    if (!Number.isInteger(targetId) || targetId < 0) return false;
    return (userList || []).some((item) => hasSameUserId(item, targetId));
}

export function normalizePostId(postId) {
    if (postId === undefined || postId === null) return '';
    return String(postId).trim();
}

export function isPinnedPost(pinId, postId) {
    const normalizedPostId = normalizePostId(postId);
    return Boolean(
        pinId &&
            normalizedPostId &&
            normalizedPostId === normalizePostId(pinId),
    );
}

export function cacheUser(user) {
    const userId = Number(user?.id);
    if (!Number.isInteger(userId) || userId < 0) return null;
    const cache = getAllUsersCache();
    const existing = cache.get(userId) || cache.get(String(userId)) || {};
    const cachedUser = { ...existing, ...user, id: userId };
    cache.set(userId, cachedUser);
    cache.delete(String(userId));

    // Bounded LRU cache eviction to prevent unbounded memory growth
    if (cache.size > MAX_USER_CACHE_LIMIT) {
        const oldestId = cache.keys().next().value;
        if (oldestId !== undefined) cache.delete(oldestId);
    }
    return cachedUser;
}

export function cacheUsers(users) {
    for (const user of users || []) cacheUser(user);
}

export function getCachedUser(userId, userCache = null) {
    const normalizedUserId = Number(userId);
    if (!Number.isInteger(normalizedUserId) || normalizedUserId < 0)
        return null;
    return (
        userCache?.get(normalizedUserId) ||
        userCache?.get(String(normalizedUserId)) ||
        getAllUsersCache().get(normalizedUserId) ||
        getAllUsersCache().get(String(normalizedUserId)) ||
        null
    );
}

export function getTimelinePageCacheKey() {
    const userScope = getCurrentUser()?.id ?? 'guest';
    return `${userScope}:${window.location.hash || '#'}`;
}

export function getTimelinePageCache(tab, { forceRefresh = false } = {}) {
    const pageKey = getTimelinePageCacheKey();
    if (!timelinePageCaches.has(pageKey)) {
        timelinePageCaches.set(pageKey, {
            timelines: new Map([
                ['foryou', { pages: new Map() }],
                ['following', { pages: new Map() }],
            ]),
        });
        trimPageCacheMap(timelinePageCaches, MAX_TIMELINE_PAGE_CACHES);
    }
    const tabCaches = timelinePageCaches.get(pageKey).timelines;
    if (forceRefresh || !tabCaches.has(tab)) {
        tabCaches.set(tab, { pages: new Map() });
        persistPageCaches();
    }
    return tabCaches.get(tab);
}

export function savePostPageCache(pageCache, pageNumber, payload) {
    pageCache.pages.set(pageNumber, payload);
    persistPageCaches();
}

export function getProfilePostPageCache(userId, subType, pinId = '') {
    const userScope = getCurrentUser()?.id ?? 'guest';
    const pageKey = `${userScope}:${window.location.hash || '#'}:${userId}:${subType}:${pinId || ''}`;
    if (!profilePostPageCaches.has(pageKey)) {
        profilePostPageCaches.set(pageKey, { pages: new Map() });
        trimPageCacheMap(
            profilePostPageCaches,
            MAX_PROFILE_POST_PAGE_CACHES,
        );
    }
    return profilePostPageCaches.get(pageKey);
}

export function invalidateProfileTabPageCache(userId, subpage) {
    const normalizedUserId = Number(userId);
    if (!Number.isInteger(normalizedUserId) || normalizedUserId < 0)
        return;

    const normalizedTab = String(subpage || 'posts');
    const postSubTypesByTab = {
        posts: ['posts_only'],
        replies: ['replies_only'],
        likes: ['likes'],
        stars: ['stars'],
    };
    const targetSubTypes = postSubTypesByTab[normalizedTab] || [];
    let changed = false;

    for (const key of profilePostPageCaches.keys()) {
        const parts = key.split(':');
        const cacheUserId = Number(parts[2]);
        const cacheSubType = parts[3];
        if (
            cacheUserId === normalizedUserId &&
            targetSubTypes.includes(cacheSubType)
        ) {
            profilePostPageCaches.delete(key);
            changed = true;
        }
    }

    if (normalizedTab === 'following' || normalizedTab === 'followers') {
        const profileUserCacheKey = `:profile-users:${normalizedUserId}:${normalizedTab}`;
        for (const key of userPageCaches.keys()) {
            if (key.includes(profileUserCacheKey)) {
                userPageCaches.delete(key);
                changed = true;
            }
        }
    }

    if (changed) persistPageCaches();
}

export function getAuxiliaryPostPageCache(scope, targetId) {
    const userScope = getCurrentUser()?.id ?? 'guest';
    const pageKey = `${userScope}:${scope}:${targetId}`;
    if (!auxiliaryPostPageCaches.has(pageKey)) {
        auxiliaryPostPageCaches.set(pageKey, { pages: new Map() });
        trimPageCacheMap(
            auxiliaryPostPageCaches,
            MAX_AUXILIARY_PAGE_CACHES,
        );
    }
    return auxiliaryPostPageCaches.get(pageKey);
}

export function getUserPageCache(scope, query = '') {
    const userScope = getCurrentUser()?.id ?? 'guest';
    const pageKey = `${userScope}:${scope}:${query}`;
    if (!userPageCaches.has(pageKey)) {
        userPageCaches.set(pageKey, { pages: new Map() });
        trimPageCacheMap(userPageCaches, MAX_AUXILIARY_PAGE_CACHES);
    }
    return userPageCaches.get(pageKey);
}

export function getScreenDataCache(key) {
    return screenDataCaches.get(key);
}

export function setScreenDataCache(key, value) {
    screenDataCaches.set(key, value);
    trimPageCacheMap(screenDataCaches, MAX_SCREEN_DATA_CACHES);
    persistPageCaches();
}

export function deleteScreenDataCache(key) {
    if (screenDataCaches.delete(key)) persistPageCaches();
}

export function getPostDetailCacheKey(postId) {
    const userScope = getCurrentUser()?.id ?? 'guest';
    return `${userScope}:post_detail:${postId}`;
}

export function getDmCacheKey(dmId) {
    const userScope = getCurrentUser()?.id ?? 'guest';
    return `${userScope}:dm:${dmId}`;
}

export function invalidateDmCaches(dmId = null) {
    let changed = false;
    if (dmId) {
        const targetDmId = String(dmId).trim();
        for (const key of screenDataCaches.keys()) {
            if (key.includes(`:dm:${targetDmId}`)) {
                screenDataCaches.delete(key);
                changed = true;
            }
        }
    } else {
        for (const key of screenDataCaches.keys()) {
            if (key.includes(':dm:')) {
                screenDataCaches.delete(key);
                changed = true;
            }
        }
    }
    if (changed) persistPageCaches();
}

export function invalidateTimelinePageCache() {
    const pageKey = getTimelinePageCacheKey();
    const existing = timelinePageCaches.get(pageKey);
    if (existing) {
        existing.timelines.set('foryou', { pages: new Map() });
        existing.timelines.set('following', { pages: new Map() });
    } else {
        timelinePageCaches.set(pageKey, {
            timelines: new Map([
                ['foryou', { pages: new Map() }],
                ['following', { pages: new Map() }],
            ]),
        });
    }
    persistPageCaches();
}

export function hasPendingRealtimeTimelineUpdate(tab = getCurrentTimelineTab()) {
    const normalizedTab = tab === 'following' ? 'following' : 'foryou';
    return pendingRealtimeTimelineUpdates[normalizedTab].length > 0;
}

export function updateRealtimeTimelineIndicator(tab = getCurrentTimelineTab()) {
    const indicator = document.getElementById('new-posts-indicator');
    if (!indicator) return;
    const isMainTimeline = (window.location.hash || '#') === '#';
    const isRealtimeActive = Boolean(getRealtimeChannel());
    if (isMainTimeline && isRealtimeActive && hasPendingRealtimeTimelineUpdate(tab)) {
        indicator.classList.remove('hidden');
    } else {
        indicator.classList.add('hidden');
    }
}

export function queueRealtimeTimelineUpdate(post) {
    if (!post?.id) return;
    const currentTab = getCurrentTimelineTab();
    ['foryou', 'following'].forEach((tab) => {
        const queue = pendingRealtimeTimelineUpdates[tab];
        if (!queue.some((p) => p.id === post.id)) {
            queue.unshift(post);
        }
    });
    updateRealtimeTimelineIndicator(currentTab);
}

export function clearRealtimeTimelineUpdate(tab = getCurrentTimelineTab()) {
    const normalizedTab = tab === 'following' ? 'following' : 'foryou';
    pendingRealtimeTimelineUpdates[normalizedTab] = [];
    updateRealtimeTimelineIndicator(normalizedTab);
}

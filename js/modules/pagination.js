import { DOM } from '../dom.js';
import { api, apiRequest } from '../api.js';
import {
    getCurrentUser,
    getAllUsersCache,
    getIsLoadingMore,
    setIsLoadingMore,
    getCurrentPagination,
    setCurrentPagination,
} from '../state.js';
import {
    cacheUser,
    savePostPageCache,
    isPinnedPost,
    normalizePostId,
    clearRealtimeTimelineUpdate,
} from './cache.js';
import {
    renderPost,
    filterBlockedPosts,
    ensureMentionedUsersCached,
} from './posts.js';
import { getSavedScrollTargetY } from './scroll.js';
import { createViewportObserver } from '../utils/viewport.js';
import { getPostsPerPage, isDataSaverEnabled } from './theme.js';
import { getEmoji } from './format.js';
import {
    escapeHTML,
    getNyaitterId,
    getUserIconUrl,
    getGroupBadgesHtml,
} from '../utils/helpers.js';

export let currentRouterGeneration = 0;
export function incrementRouterGeneration() {
    currentRouterGeneration += 1;
    return currentRouterGeneration;
}
export function getRouterGeneration() {
    return currentRouterGeneration;
}

export async function fetchOptimizedPostPage(
    type,
    options,
    page,
    beforeCursor = null,
) {
    const pageSize = getPostsPerPage();
    const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
    });
    if (beforeCursor != null) {
        const cursorValue = String(beforeCursor).trim();
        if (cursorValue) {
            params.set('cursor', cursorValue);
            if (/^\d+$/.test(cursorValue)) {
                params.set('before_id', cursorValue);
            }
            params.delete('offset');
        }
    }
    let showPinPost = false;

    if (type === 'timeline') {
        if (options.tab === 'foryou') {
            params.set('mode', 'recommended');
        } else {
            params.set('mode', 'timeline');
            params.set('tab', options.tab || 'following');
        }
    } else if (type === 'search') {
        params.set('mode', 'search');
        params.set('q', options.query || '');
    } else if (type === 'profile_posts') {
        params.set('mode', 'profile');
        params.set('user_id', String(options.userId || ''));
        params.set('sub_type', options.subType || 'all');
        if (
            options.pinId &&
            page === 0 &&
            options.subType === 'posts_only'
        ) {
            params.set('pin_id', String(options.pinId));
            showPinPost = true;
        }
    } else if (type === 'group_posts') {
        const groupId = String(options.groupId || '');
        if (!groupId) throw new Error('グループIDが必要です。');
        if (options.mode) params.set('mode', options.mode);
        if (options.subType) params.set('sub_type', options.subType);
        if (options.authorId != null) params.set('author_id', String(options.authorId));
        const { data, error } = await apiRequest(
            `/server/api/groups/${encodeURIComponent(groupId)}/posts?${params.toString()}`,
            { signal: options.signal },
        );
        if (error) throw error;
        const posts = data.posts || [];
        const hasMore = !!(data.has_next ?? data.has_more);
        const nextCursor = data.next_cursor ?? (
            hasMore && posts.length > 0 ? String(posts[posts.length - 1].id) : null
        );
        return {
            posts,
            hasMore,
            nextCursor,
            showPinPost: false,
            context: null,
        };
    } else if (type === 'likes' || type === 'stars') {
        const from = page * pageSize;
        if (options.userId) {
            const { data, error } = await apiRequest(
                `/server/api/users/${encodeURIComponent(options.userId)}/${type}?limit=${pageSize}&offset=${from}`,
                { signal: options.signal },
            );
            if (error) throw error;
            const posts = data.posts || [];
            const hasMore = !!(data.has_more ?? data.has_next);
            const nextCursor = data.next_cursor ?? (
                hasMore && posts.length > 0 ? String(posts[posts.length - 1].id) : null
            );
            return {
                posts,
                hasMore,
                nextCursor,
                showPinPost: false,
                context: null,
            };
        }
        const ids = Array.isArray(options.ids) ? options.ids : [];
        const pageIds = ids.slice(from, from + pageSize);
        params.set('mode', 'ids');
        params.set('ids', pageIds.join(','));
        params.set('offset', '0');
        const { data, error } = await apiRequest(
            `/server/api/posts/page?${params.toString()}`,
            { signal: options.signal },
        );
        if (error) throw error;
        return {
            posts: data.posts || [],
            hasMore: ids.length > from + pageSize,
            nextCursor: null,
            showPinPost: false,
            context: data.context || null,
        };
    } else {
        return null;
    }

    const { data, error } = await apiRequest(
        `/server/api/posts/page?${params.toString()}`,
        { signal: options.signal },
    );
    if (error) throw error;
    const posts = data.posts || [];
    const hasMore = !!(data.has_more ?? data.has_next);
    const nextCursor = data.next_cursor ?? (
        hasMore && posts.length > 0 ? String(posts[posts.length - 1].id) : null
    );
    return {
        posts,
        hasMore,
        nextCursor,
        showPinPost,
        context: data.context || null,
    };
}

export function bindPaginationOptionsToRoute(options) {
    const routeGeneration = currentRouterGeneration;
    const callerIsCurrent = options.isCurrent;
    return {
        ...options,
        isCurrent: () =>
            routeGeneration === currentRouterGeneration &&
            (typeof callerIsCurrent !== 'function' || callerIsCurrent()),
    };
}

export function isActivePaginationLoader(container, trigger, options) {
    return (
        getCurrentPagination().options === options &&
        container.isConnected &&
        container.contains(trigger) &&
        options.isCurrent()
    );
}

export async function loadPostsWithPagination(container, type, options = {}) {
    options = bindPaginationOptionsToRoute(options);
    const pageSize = getPostsPerPage();
    let localPostLoadObserver;
    const postPageCache = options.pageCache || { pages: new Map() };
    const preloadPromises = new Map();
    setCurrentPagination({ page: 0, hasMore: true, type, options });

    const trigger = document.createElement('div');
    trigger.className = 'load-more-trigger';
    container.appendChild(trigger);

    const triggerPreloadNext = (nextPage, cursor) => {
        if (!getCurrentPagination().hasMore) return;
        if (postPageCache.pages.has(nextPage) || preloadPromises.has(nextPage)) return;

        const promise = fetchOptimizedPostPage(type, options, nextPage, cursor)
            .then((result) => {
                if (result) {
                    savePostPageCache(postPageCache, nextPage, result);
                }
                return result;
            })
            .catch(() => null)
            .finally(() => {
                preloadPromises.delete(nextPage);
            });

        preloadPromises.set(nextPage, promise);
    };

    const checkAndTriggerNextIfVisible = () => {
        if (!getCurrentPagination().hasMore || getIsLoadingMore()) return;
        const currentTrigger = container.querySelector('.load-more-trigger');
        if (!isActivePaginationLoader(container, currentTrigger, options)) return;
        const rect = currentTrigger.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        if (rect.top <= vh + 300 && rect.bottom >= -300) {
            void loadMore();
        }
    };

    const loadMore = async ({ cachedOnly = false } = {}) => {
        const currentTrigger = container.querySelector('.load-more-trigger');
        if (
            !isActivePaginationLoader(container, currentTrigger, options) ||
            getIsLoadingMore() ||
            !getCurrentPagination().hasMore
        ) {
            if (!currentTrigger && localPostLoadObserver) {
                localPostLoadObserver.disconnect();
            }
            return false;
        }

        setIsLoadingMore(true);
        currentTrigger.innerHTML = '<div class="spinner"></div>';
        let posterror = null;

        try {
            const pageNumber = getCurrentPagination().page;
            let isLoadedFromCache = Boolean(postPageCache?.pages?.has(pageNumber));
            let optimizedPage = postPageCache?.pages.get(pageNumber);
            if (!optimizedPage && preloadPromises.has(pageNumber)) {
                optimizedPage = await preloadPromises.get(pageNumber);
                isLoadedFromCache = Boolean(optimizedPage);
            }
            if (!optimizedPage && cachedOnly) return false;
            if (!optimizedPage) {
                const previousPage =
                    pageNumber > 0
                        ? postPageCache?.pages.get(pageNumber - 1)
                        : null;
                optimizedPage = await fetchOptimizedPostPage(
                    type,
                    options,
                    pageNumber,
                    previousPage?.nextCursor ?? null,
                );
                if (postPageCache && optimizedPage) {
                    savePostPageCache(postPageCache, pageNumber, optimizedPage);
                }
            }

            let posts = optimizedPage?.posts || [];
            let hasMoreItems = optimizedPage?.hasMore ?? true;
            let showPinPost = optimizedPage?.showPinPost || false;
            const pageContext = optimizedPage?.context || null;

            if (!isActivePaginationLoader(container, currentTrigger, options)) {
                return false;
            }

            if (posts && posts.length > 0) {
                for (const user of pageContext?.users || []) {
                    cacheUser(user);
                }
                posts = filterBlockedPosts(posts);
                const metricsPromise = Promise.resolve();

                await ensureMentionedUsersCached(posts.map((p) => p.content));

                if (showPinPost) {
                    const pinPost = posts.find((p) => isPinnedPost(p.id, options.pinId));
                    if (pinPost) {
                        const postEl = await renderPost(pinPost, pinPost.author, {
                            userCache: getAllUsersCache(),
                            metricsPromise,
                            isPinned: true,
                            clampHeight: true,
                        });
                        if (!isActivePaginationLoader(container, currentTrigger, options)) {
                            return false;
                        }
                        if (postEl) currentTrigger.before(postEl);
                    }
                }

                const regularPosts = posts.filter(
                    (post) => !(showPinPost && isPinnedPost(post.id, options.pinId)),
                );

                if (isLoadedFromCache) {
                    // キャッシュからの復元時は遅延なしで即時一括描画する
                    const renderedPosts = await Promise.all(regularPosts.map((post) => renderPost(post, post.author, {
                        userCache: getAllUsersCache(),
                        metricsPromise,
                        clampHeight: true,
                    })));
                    if (!isActivePaginationLoader(container, currentTrigger, options)) {
                        return false;
                    }
                    const fragment = document.createDocumentFragment();
                    for (const postEl of renderedPosts) {
                        if (postEl) fragment.appendChild(postEl);
                    }
                    if (fragment.childNodes.length > 0) currentTrigger.before(fragment);
                } else {
                    // ネットワーク経由の初回フェッチ時は段階的に描画して制御を返す
                    const RENDER_CHUNK_SIZE = 6;
                    for (let start = 0; start < regularPosts.length; start += RENDER_CHUNK_SIZE) {
                        if (!isActivePaginationLoader(container, currentTrigger, options)) {
                            return false;
                        }
                        const renderedPosts = await Promise.all(regularPosts
                            .slice(start, start + RENDER_CHUNK_SIZE)
                            .map((post) => renderPost(post, post.author, {
                                userCache: getAllUsersCache(),
                                metricsPromise,
                                clampHeight: true,
                            })));
                        const fragment = document.createDocumentFragment();
                        for (const postEl of renderedPosts) {
                            if (postEl) fragment.appendChild(postEl);
                        }
                        if (fragment.childNodes.length > 0) currentTrigger.before(fragment);
                        if (start + RENDER_CHUNK_SIZE < regularPosts.length) {
                            await new Promise((resolve) => requestAnimationFrame(resolve));
                        }
                    }
                }
            }

            if (pageNumber === 0 && type === 'timeline') {
                clearRealtimeTimelineUpdate(options.tab);
            }
            getCurrentPagination().page++;
            getCurrentPagination().hasMore = hasMoreItems;
            if (hasMoreItems && isActivePaginationLoader(container, currentTrigger, options)) {
                triggerPreloadNext(
                    getCurrentPagination().page,
                    optimizedPage?.nextCursor ?? null,
                );
            }
            return true;
        } catch (error) {
            if (!isActivePaginationLoader(container, currentTrigger, options)) {
                return false;
            }
            posterror = error;
            console.error('ポストの読み込みに失敗:', error);
            currentTrigger.innerText = 'ポストの読み込みに失敗しました。';
            getCurrentPagination().hasMore = false;
            if (localPostLoadObserver) localPostLoadObserver.disconnect();
            return false;
        } finally {
            setIsLoadingMore(false);
            if (!isActivePaginationLoader(container, currentTrigger, options)) {
                return;
            }

            const finalTrigger = container.querySelector('.load-more-trigger');
            if (!finalTrigger) return;

            if (!posterror) {
                const emptyMessages = {
                    timeline: 'まだポストがありません。',
                    profile_posts: 'このユーザーはまだポストしていません。',
                    replies: 'まだ返信はありません。',
                    search: '該当するポストはありません。',
                    likes: 'いいねしたポストはありません。',
                    stars: 'お気に入りに登録したポストはありません。',
                    group_posts: 'このグループにはまだポストがありません。',
                };
                const emptyMessageKey =
                    options.subType === 'replies_only' ? 'replies' : type;

                if (!getCurrentPagination().hasMore) {
                    finalTrigger.innerText =
                        container.querySelectorAll('.post').length === 0
                            ? emptyMessages[emptyMessageKey] || ''
                            : 'すべてのポストを読み込みました';
                    if (localPostLoadObserver) localPostLoadObserver.disconnect();
                } else {
                    if (finalTrigger.innerHTML.includes('spinner')) {
                        finalTrigger.innerHTML = '';
                    }
                    requestAnimationFrame(checkAndTriggerNextIfVisible);
                }
            }
        }
    };

    localPostLoadObserver = createViewportObserver(
        (entries) => {
            if (
                entries[0].isIntersecting &&
                isActivePaginationLoader(container, trigger, options) &&
                !getIsLoadingMore()
            ) {
                void loadMore();
            }
        },
        { rootMargin: '300px' },
    );
    localPostLoadObserver.observe(trigger);

    await loadMore({ cachedOnly: Boolean(options.cachedOnly) });

    // スクロール位置が保存されており、かつキャッシュが存在する場合、
    // 目標のスクロール位置を十分にカバーできる高さになるまでキャッシュから連続ロードする
    const targetScrollY = getSavedScrollTargetY();
    if (postPageCache?.pages && targetScrollY > 0) {
        const MAX_AUTO_RESTORE_PAGES = 30;
        let iteration = 0;
        while (
            iteration < MAX_AUTO_RESTORE_PAGES &&
            getCurrentPagination().hasMore &&
            isActivePaginationLoader(container, trigger, options)
        ) {
            const nextPageNum = getCurrentPagination().page;
            if (!postPageCache.pages.has(nextPageNum)) {
                break;
            }
            const currentDocHeight = Math.max(
                document.documentElement.scrollHeight || 0,
                document.body.scrollHeight || 0,
                container.scrollHeight || 0,
            );
            const viewportHeight = window.innerHeight || 0;
            if (currentDocHeight >= targetScrollY + viewportHeight * 0.5) {
                break;
            }
            const loaded = await loadMore({ cachedOnly: true });
            if (!loaded) break;
            iteration += 1;
        }

        // スクロール位置までページを読みだした後、追加で1ページを読み込む
        if (
            getCurrentPagination().hasMore &&
            isActivePaginationLoader(container, trigger, options)
        ) {
            await loadMore({ cachedOnly: true });
        }

        // キャッシュ復元完了直後に即座にスクロール位置を適用
        window.scrollTo({ top: targetScrollY, left: 0, behavior: 'instant' });
    }

    return {
        loadMore,
        disconnect: () => localPostLoadObserver?.disconnect(),
    };
}

async function fetchUserPageData(type, options, pageNumber, pageSize) {
    const from = pageNumber * pageSize;
    const to = from + pageSize - 1 + (type === 'search' ? 1 : 0);
    const selectColumns = 'id, name, me, scid, icon_data, admin, verify';

    let users = [];
    let error = null;
    let hasMoreForPage = true;

    if (type === 'follows') {
        if (options.userId) {
            const params = new URLSearchParams({ limit: String(pageSize) });
            if (options.nextCursor) params.set('cursor', options.nextCursor);
            else params.set('offset', String(from));
            const result = await apiRequest(
                `/server/api/users/${encodeURIComponent(options.userId)}/following?${params.toString()}`,
                { signal: options.signal },
            );
            users = Array.isArray(result.data?.following)
                ? result.data.following
                : [];
            options.nextCursor = result.data?.next_cursor || null;
            hasMoreForPage = result.data?.has_more ?? users.length >= pageSize;
            error = result.error;
        } else {
            const idsToFetch = (options.ids || []).slice(from, to + 1);
            if (idsToFetch.length > 0) {
                const result = await api
                    .from('user')
                    .select(selectColumns)
                    .in('id', idsToFetch)
                    .signal(options.signal);
                users = result.data;
                error = result.error;
            }
        }
    } else if (type === 'followers') {
        const params = new URLSearchParams({ limit: String(pageSize) });
        if (options.nextCursor) params.set('cursor', options.nextCursor);
        else params.set('offset', String(from));
        const result = await apiRequest(
            `/server/api/users/${encodeURIComponent(options.userId)}/followers?${params.toString()}`,
            { signal: options.signal },
        );
        users = Array.isArray(result.data?.followers)
            ? result.data.followers
            : [];
        options.nextCursor = result.data?.next_cursor || null;
        hasMoreForPage = result.data?.has_more ?? users.length >= pageSize;
        error = result.error;
    } else if (type === 'search') {
        const result = await api
            .from('user')
            .select(selectColumns)
            .or(options.filters || '')
            .order('id', { ascending: true })
            .range(from, to)
            .signal(options.signal);
        users = Array.isArray(result.data) ? result.data : [];
        error = result.error;
        hasMoreForPage = users.length > pageSize;
        users = users.slice(0, pageSize);
        if (typeof options.sortResults === 'function') {
            users.sort(options.sortResults);
        }
    }
    if (type !== 'search') {
        hasMoreForPage = users.length >= pageSize;
    }
    if (error) throw error;
    return { users, hasMore: hasMoreForPage };
}

export function renderUserCard(u) {
    const userCard = document.createElement('div');
    userCard.className = 'profile-card widget-item';

    const userId = u.id || u.user_id;
    const userLink = document.createElement('a');
    userLink.href = `#profile/${userId}`;
    userLink.className = 'profile-link';
    userLink.style.cssText =
        'display:flex; align-items:center; gap:0.8rem; text-decoration:none; color:inherit;';

    const badgeHTML = (u.admin
        ? ` <img src="icons/admin.png" class="admin-badge" title="NyaitterTeam">`
        : u.verify
          ? ` <img src="icons/verify.png" class="verify-badge" title="認証済み">`
          : '') + getGroupBadgesHtml(u);

    const bioText = u.me || u.bio || '';

    userLink.innerHTML = `
        <img src="${getUserIconUrl(u)}" style="width:48px; height:48px; border-radius:50%; object-fit:cover;" alt="${escapeHTML(u.name || '')}'s icon">
        <div>
            <span class="name" style="font-weight:700;">${getEmoji(escapeHTML(u.name || '不明'))}${badgeHTML}</span>
            <span class="id" style="color:var(--secondary-text-color);">${getNyaitterId(u)}</span>
            ${bioText ? `<p class="me" style="margin:0.2rem 0 0;">${getEmoji(escapeHTML(bioText))}</p>` : ''}
        </div>`;

    userCard.appendChild(userLink);
    return userCard;
}

export async function loadUsersWithPagination(container, type, options = {}) {
    options = bindPaginationOptionsToRoute(options);
    const userPageCache = options.pageCache || { pages: new Map() };
    const preloadPromises = new Map();
    const requestedPageSize = Number(options.pageSize) || 20;
    const pageSize = isDataSaverEnabled()
        ? Math.min(requestedPageSize, 10)
        : requestedPageSize;
    setCurrentPagination({ page: 0, hasMore: true, type, options });

    let trigger = container.querySelector('.load-more-trigger');
    if (trigger) trigger.remove();

    trigger = document.createElement('div');
    trigger.className = 'load-more-trigger';
    container.appendChild(trigger);

    const triggerPreloadNext = (nextPage) => {
        if (!getCurrentPagination().hasMore) return;
        if (userPageCache.pages.has(nextPage) || preloadPromises.has(nextPage)) return;

        const promise = fetchUserPageData(type, options, nextPage, pageSize)
            .then((result) => {
                if (result) {
                    savePostPageCache(userPageCache, nextPage, result);
                }
                return result;
            })
            .catch(() => null)
            .finally(() => {
                preloadPromises.delete(nextPage);
            });

        preloadPromises.set(nextPage, promise);
    };

    const checkAndTriggerNextIfVisible = () => {
        if (!getCurrentPagination().hasMore || getIsLoadingMore()) return;
        const currentTrigger = container.querySelector('.load-more-trigger');
        if (!isActivePaginationLoader(container, currentTrigger, options)) return;
        const rect = currentTrigger.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        if (rect.top <= vh + 300 && rect.bottom >= -300) {
            void loadMore();
        }
    };

    const loadMore = async ({ cachedOnly = false } = {}) => {
        if (
            !isActivePaginationLoader(container, trigger, options) ||
            getIsLoadingMore() ||
            !getCurrentPagination().hasMore
        )
            return false;
        setIsLoadingMore(true);
        trigger.innerHTML = '<div class="spinner"></div>';

        let users = [];
        let error = null;
        let hasMoreForPage = true;
        const pageNumber = getCurrentPagination().page;
        let cachedPage = userPageCache?.pages.get(pageNumber);
        if (!cachedPage && preloadPromises.has(pageNumber)) {
            cachedPage = await preloadPromises.get(pageNumber);
        }

        try {
            if (cachedPage) {
                users = Array.isArray(cachedPage.users) ? cachedPage.users : [];
                hasMoreForPage = Boolean(cachedPage.hasMore);
            } else {
                if (cachedOnly) {
                    if (isActivePaginationLoader(container, trigger, options)) {
                        trigger.innerHTML = '';
                    }
                    return false;
                }
                try {
                    const result = await fetchUserPageData(type, options, pageNumber, pageSize);
                    users = result.users;
                    hasMoreForPage = result.hasMore;
                    if (userPageCache) {
                        savePostPageCache(userPageCache, pageNumber, {
                            users,
                            hasMore: hasMoreForPage,
                        });
                    }
                } catch (err) {
                    error = err;
                }
            }

            if (!isActivePaginationLoader(container, trigger, options)) return false;

            if (error) {
                console.error(`${type}のユーザー読み込みに失敗:`, error);
                trigger.innerHTML = '読み込みに失敗しました。';
            } else {
                if (users && users.length > 0) {
                    users.forEach((u) => container.insertBefore(renderUserCard(u), trigger));
                    getCurrentPagination().page++;
                    if (!hasMoreForPage) {
                        getCurrentPagination().hasMore = false;
                    } else if (isActivePaginationLoader(container, trigger, options)) {
                        triggerPreloadNext(getCurrentPagination().page);
                    }
                } else {
                    getCurrentPagination().hasMore = false;
                }

                if (!getCurrentPagination().hasMore) {
                    const emptyMessages = {
                        follows: '誰もフォローしていません。',
                        followers: 'まだフォロワーがいません。',
                        search: 'ユーザーは見つかりませんでした。',
                    };
                    trigger.innerHTML =
                        container.querySelectorAll('.profile-card').length === 0
                            ? emptyMessages[type] || ''
                            : 'すべてのユーザーを読み込みました';
                } else {
                    trigger.innerHTML = '';
                    requestAnimationFrame(checkAndTriggerNextIfVisible);
                }
            }
            return !error;
        } finally {
            setIsLoadingMore(false);
        }
    };

    const userObserver = createViewportObserver(
        (entries) => {
            if (
                entries[0].isIntersecting &&
                isActivePaginationLoader(container, trigger, options) &&
                !getIsLoadingMore()
            ) {
                loadMore();
            }
        },
        { rootMargin: '300px' },
    );
    userObserver.observe(trigger);

    await loadMore();

    const targetScrollY = getSavedScrollTargetY();
    if (userPageCache?.pages && targetScrollY > 0) {
        const MAX_AUTO_RESTORE_PAGES = 30;
        let iteration = 0;
        while (
            iteration < MAX_AUTO_RESTORE_PAGES &&
            getCurrentPagination().hasMore &&
            isActivePaginationLoader(container, trigger, options)
        ) {
            const nextPageNum = getCurrentPagination().page;
            if (!userPageCache.pages.has(nextPageNum)) {
                break;
            }
            const currentDocHeight = Math.max(
                document.documentElement.scrollHeight || 0,
                document.body.scrollHeight || 0,
                container.scrollHeight || 0,
            );
            const viewportHeight = window.innerHeight || 0;
            if (currentDocHeight >= targetScrollY + viewportHeight * 0.5) {
                break;
            }
            const loaded = await loadMore({ cachedOnly: true });
            if (!loaded) break;
            iteration += 1;
        }

        // スクロール位置までページを読みだした後、追加で1ページを読み込む
        if (
            getCurrentPagination().hasMore &&
            isActivePaginationLoader(container, trigger, options)
        ) {
            await loadMore({ cachedOnly: true });
        }
    }

    return {
        loadMore,
        disconnect: () => userObserver?.disconnect(),
    };
}

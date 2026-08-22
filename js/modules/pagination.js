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
        params.set('before_id', String(beforeCursor));
        params.delete('offset');
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
        );
        if (error) throw error;
        return {
            posts: data.posts || [],
            hasMore: !!data.has_next,
            nextCursor: data.next_cursor ?? null,
            showPinPost: false,
            context: null,
        };
    } else if (type === 'likes' || type === 'stars') {
        const from = page * pageSize;
        if (options.userId) {
            const { data, error } = await apiRequest(
                `/server/api/users/${encodeURIComponent(options.userId)}/${type}?limit=${pageSize}&offset=${from}`,
            );
            if (error) throw error;
            return {
                posts: data.posts || [],
                hasMore: !!data.has_more,
                nextCursor: data.next_cursor ?? null,
                showPinPost: false,
                context: null,
            };
        }
        const ids = [...(options.ids || [])].reverse();
        const pageIds = ids.slice(from, from + pageSize);
        params.set('mode', 'ids');
        params.set('ids', pageIds.join(','));
        params.set('offset', '0');
        const { data, error } = await apiRequest(
            `/server/api/posts/page?${params.toString()}`,
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
    );
    if (error) throw error;
    return {
        posts: data.posts || [],
        hasMore: !!data.has_more,
        nextCursor: data.next_cursor ?? null,
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
    const postPageCache = options.pageCache || null;
    setCurrentPagination({ page: 0, hasMore: true, type, options });

    const trigger = document.createElement('div');
    trigger.className = 'load-more-trigger';
    container.appendChild(trigger);

    const load_btn = document.createElement('button');
    load_btn.className = 'load-more-btn';
    load_btn.innerText = 'さらに読み込む';
    load_btn.onclick = () => loadMore();
    container.appendChild(load_btn);

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
        load_btn.classList.add('hide');

        try {
            const pageNumber = getCurrentPagination().page;
            let optimizedPage = postPageCache?.pages.get(pageNumber);
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

                for (const post of posts) {
                    if (showPinPost && isPinnedPost(post.id, options.pinId)) continue;
                    const postEl = await renderPost(post, post.author, {
                        userCache: getAllUsersCache(),
                        metricsPromise,
                        clampHeight: true,
                    });
                    if (!isActivePaginationLoader(container, currentTrigger, options)) {
                        return false;
                    }
                    if (postEl) currentTrigger.before(postEl);
                }
            }

            getCurrentPagination().page++;
            getCurrentPagination().hasMore = hasMoreItems;
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
            load_btn.remove();
            return false;
        } finally {
            if (!isActivePaginationLoader(container, currentTrigger, options)) {
                return;
            }
            load_btn.classList.remove('hide');
            setIsLoadingMore(false);

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
                    load_btn.remove();
                    finalTrigger.innerText =
                        container.querySelectorAll('.post').length === 0
                            ? emptyMessages[emptyMessageKey] || ''
                            : 'すべてのポストを読み込みました';
                    if (localPostLoadObserver) localPostLoadObserver.disconnect();
                } else if (finalTrigger.innerHTML.includes('spinner')) {
                    finalTrigger.innerHTML = '';
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
        { rootMargin: '200px' },
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
    }

    return {
        loadMore,
        disconnect: () => localPostLoadObserver?.disconnect(),
    };
}

export async function loadUsersWithPagination(container, type, options = {}) {
    options = bindPaginationOptionsToRoute(options);
    const userPageCache = options.pageCache || null;
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

    const renderUserCard = (u) => {
        const userCard = document.createElement('div');
        userCard.className = 'profile-card widget-item';

        const userLink = document.createElement('a');
        userLink.href = `#profile/${u.id}`;
        userLink.className = 'profile-link';
        userLink.style.cssText =
            'display:flex; align-items:center; gap:0.8rem; text-decoration:none; color:inherit;';

        const badgeHTML = (u.admin
            ? ` <img src="icons/admin.png" class="admin-badge" title="NyaitterTeam">`
            : u.verify
              ? ` <img src="icons/verify.png" class="verify-badge" title="認証済み">`
              : '') + getGroupBadgesHtml(u);

        userLink.innerHTML = `
            <img src="${getUserIconUrl(u)}" style="width:48px; height:48px; border-radius:50%;" alt="${escapeHTML(u.name)}'s icon">
            <div>
                <span class="name" style="font-weight:700;">${getEmoji(escapeHTML(u.name))}${badgeHTML}</span>
                <span class="id" style="color:var(--secondary-text-color);">${getNyaitterId(u)}</span>
                <p class="me" style="margin:0.2rem 0 0;">${getEmoji(escapeHTML(u.me || ''))}</p>
            </div>`;

        userCard.appendChild(userLink);
        return userCard;
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

        const from = getCurrentPagination().page * pageSize;
        const to = from + pageSize - 1 + (type === 'search' ? 1 : 0);

        let users = [];
        let error = null;
        let hasMoreForPage = true;
        const pageNumber = getCurrentPagination().page;
        const cachedPage = userPageCache?.pages.get(pageNumber);

        if (cachedPage) {
            users = Array.isArray(cachedPage.users) ? cachedPage.users : [];
            hasMoreForPage = Boolean(cachedPage.hasMore);
        } else {
            if (cachedOnly) {
                if (isActivePaginationLoader(container, trigger, options)) {
                    setIsLoadingMore(false);
                    trigger.innerHTML = '';
                }
                return false;
            }
            const selectColumns = 'id, name, me, scid, icon_data, admin, verify';

            if (type === 'follows') {
                if (options.userId) {
                    const result = await apiRequest(
                        `/server/api/users/${encodeURIComponent(options.userId)}/following?limit=${pageSize}&offset=${from}`,
                    );
                    users = Array.isArray(result.data?.following)
                        ? result.data.following
                        : [];
                    error = result.error;
                } else {
                    const idsToFetch = (options.ids || []).slice(from, to + 1);
                    if (idsToFetch.length > 0) {
                        const result = await api
                            .from('user')
                            .select(selectColumns)
                            .in('id', idsToFetch);
                        users = result.data;
                        error = result.error;
                    }
                }
            } else if (type === 'followers') {
                const result = await apiRequest(
                    `/server/api/users/${encodeURIComponent(options.userId)}/followers?limit=${pageSize}&offset=${from}`,
                );
                users = Array.isArray(result.data?.followers)
                    ? result.data.followers
                    : [];
                error = result.error;
            } else if (type === 'search') {
                const result = await api
                    .from('user')
                    .select(selectColumns)
                    .or(options.filters || '')
                    .order('id', { ascending: true })
                    .range(from, to);
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
            if (!error && userPageCache) {
                savePostPageCache(userPageCache, pageNumber, {
                    users,
                    hasMore: hasMoreForPage,
                });
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
            }
        }
        setIsLoadingMore(false);
        return !error;
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
        { rootMargin: '200px' },
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

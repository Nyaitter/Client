import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { apiRequest } from '../api.js';
import { getAllUsersCache } from '../state.js';
import {
    getPostDetailCacheKey,
    getScreenDataCache,
    setScreenDataCache,
} from '../modules/cache.js';
import { renderPost } from '../modules/posts.js';
import { getScrollRouteKey, getSavedScrollPositions } from '../modules/scroll.js';
import { createViewportObserver } from '../utils/viewport.js';
import { showLoading } from '../utils/helpers.js';

export async function showPostDetail(postId, { forceRefresh = false } = {}, showScreenFn = null) {
    const normalizedPostId = Number(postId);
    if (!Number.isInteger(normalizedPostId) || normalizedPostId <= 0) {
        throw new Error('無効なポストIDです。');
    }
    const postDetailCacheKey = getPostDetailCacheKey(normalizedPostId);
    DOM.pageHeader.innerHTML = `
        <div class="header-with-back-button">
            <button class="header-back-btn" data-action="history-back">${ICONS.back}</button>
            <h2 id="page-title">ポスト</h2>
        </div>`;

    if (typeof showScreenFn === 'function') {
        showScreenFn('post-detail-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('post-detail-screen')?.classList.remove('hidden');
    }

    const contentDiv = DOM.postDetailContent;
    contentDiv.innerHTML = '<div class="spinner"></div>';

    try {
        let threadPayload = forceRefresh ? null : getScreenDataCache(postDetailCacheKey);
        let threadError = null;
        if (!threadPayload) {
            const result = await apiRequest(
                `/server/api/posts/${encodeURIComponent(normalizedPostId)}/thread`,
            );
            threadPayload = result.data || null;
            threadError = result.error;
            if (!threadError && threadPayload) {
                setScreenDataCache(postDetailCacheKey, threadPayload);
            }
        }
        const mainPost = threadPayload?.post || null;
        const allRepliesRaw = Array.isArray(threadPayload?.replies)
            ? threadPayload.replies
            : [];
        if (threadError || !mainPost) {
            throw threadError || new Error('ポストの取得に失敗しました。');
        }

        if (mainPost.repost_to && !mainPost.content) {
            window.location.replace(`#post/${mainPost.repost_to}`);
            return;
        }

        const metricsPromise = Promise.resolve();
        contentDiv.innerHTML = '';

        if (mainPost.reply_to_post) {
            const parentPostEl = await renderPost(
                mainPost.reply_to_post,
                mainPost.reply_to_post.author,
                { userCache: getAllUsersCache(), metricsPromise },
            );
            if (parentPostEl) {
                const parentContainer = document.createElement('div');
                parentContainer.className = 'parent-post-container';
                parentContainer.appendChild(parentPostEl);
                contentDiv.appendChild(parentContainer);
            }
        }

        const mainPostEl = await renderPost(mainPost, mainPost.author, {
            userCache: getAllUsersCache(),
            metricsPromise,
        });
        if (mainPostEl) contentDiv.appendChild(mainPostEl);

        const repliesHeader = document.createElement('h3');
        repliesHeader.textContent = '返信';
        repliesHeader.style.cssText =
            'padding: 1rem; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); margin-top: 1rem; margin-bottom: 0; font-size: 1.2rem;';
        contentDiv.appendChild(repliesHeader);

        const rootPostId = normalizedPostId;
        const normalizedReplies = allRepliesRaw
            .map((reply) => {
                const replyId = Number(reply?.id);
                const parentId = Number(reply?.reply_id ?? reply?.replyTo);
                if (!Number.isInteger(replyId) || !Number.isInteger(parentId)) {
                    return null;
                }
                return {
                    ...reply,
                    id: replyId,
                    reply_id: parentId,
                    author: reply.author || reply.user || null,
                };
            })
            .filter(Boolean);

        const repliesByParentId = new Map();
        normalizedReplies.forEach((reply) => {
            const parentId = reply.reply_id;
            if (!repliesByParentId.has(parentId)) {
                repliesByParentId.set(parentId, []);
            }
            repliesByParentId.get(parentId).push(reply);
        });

        for (const replies of repliesByParentId.values()) {
            replies.sort((a, b) => {
                const aTime = new Date(a.created_at).getTime();
                const bTime = new Date(b.created_at).getTime();
                return aTime - bTime;
            });
        }

        const repliesById = new Map(
            normalizedReplies.map((reply) => [reply.id, reply]),
        );
        const flatReplyList = [];
        const visitedReplyIds = new Set();
        const buildFlatList = (parentId, depth = 0) => {
            const children = repliesByParentId.get(Number(parentId)) || [];
            for (const child of children) {
                if (visitedReplyIds.has(child.id)) continue;
                visitedReplyIds.add(child.id);
                flatReplyList.push({ ...child, thread_depth: depth });
                buildFlatList(child.id, depth + 1);
            }
        };
        buildFlatList(rootPostId);

        const repliesContainer = document.createElement('div');
        contentDiv.appendChild(repliesContainer);
        const trigger = document.createElement('div');
        trigger.className = 'load-more-trigger';
        contentDiv.appendChild(trigger);

        let pagination = { page: 0, hasMore: flatReplyList.length > 0 };
        const REPLIES_PER_PAGE = 10;
        let isLoadingReplies = false;

        const loadMoreReplies = async () => {
            if (isLoadingReplies || !pagination.hasMore) return;
            isLoadingReplies = true;
            trigger.innerHTML = '<div class="spinner"></div>';

            const from = pagination.page * REPLIES_PER_PAGE;
            const to = from + REPLIES_PER_PAGE;
            const repliesToRender = flatReplyList.slice(from, to);

            for (const reply of repliesToRender) {
                const replyDepth = Math.max(0, Number(reply.thread_depth) || 0);
                const postForRender = { ...reply };

                const authorForRender = reply.author || {
                    id: reply.author_id,
                    name: reply.author_name,
                    scid: reply.author_scid,
                    icon_data: reply.author_icon_data,
                    admin: reply.author_admin,
                    verify: reply.author_verify,
                };

                if (replyDepth > 0) {
                    const parentReply = repliesById.get(reply.reply_id);
                    if (!postForRender.reply_to_post && parentReply) {
                        postForRender.reply_to_post = {
                            ...parentReply,
                            author: parentReply.author || parentReply.user || null,
                        };
                    }
                    if (!postForRender.reply_to_post && reply.reply_to_user_id) {
                        postForRender.reply_to_post = {
                            author: {
                                id: reply.reply_to_user_id,
                                name: reply.reply_to_user_name,
                            },
                        };
                    }
                }

                const isDirectReply = replyDepth === 0;
                const postEl = await renderPost(postForRender, authorForRender, {
                    userCache: getAllUsersCache(),
                    isDirectReply,
                    metricsPromise,
                });

                if (postEl) {
                    let replyNode = postEl;
                    if (replyDepth > 0) {
                        const nestedWrapper = document.createElement('div');
                        nestedWrapper.className = 'thread-nested-reply';
                        nestedWrapper.style.setProperty(
                            '--reply-indent',
                            `${Math.min(replyDepth, 3) * 2}rem`,
                        );
                        nestedWrapper.dataset.replyDepth = String(replyDepth);
                        nestedWrapper.appendChild(postEl);
                        replyNode = nestedWrapper;
                    }
                    repliesContainer.appendChild(replyNode);
                }
            }

            pagination.page++;
            if (pagination.page * REPLIES_PER_PAGE >= flatReplyList.length) {
                pagination.hasMore = false;
            }

            if (!pagination.hasMore) {
                trigger.textContent = repliesContainer.hasChildNodes()
                    ? 'すべての返信を読み込みました'
                    : 'まだ返信はありません。';
                if (repliesLoadObserver) repliesLoadObserver.disconnect();
            } else {
                trigger.innerHTML = '';
            }
            isLoadingReplies = false;
        };

        const repliesLoadObserver = createViewportObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    void loadMoreReplies();
                }
            },
            { rootMargin: '200px' },
        );

        const savedDetailPosition =
            getSavedScrollPositions()[getScrollRouteKey()];
        const savedDetailY = Number(savedDetailPosition?.y);
        const restoreTargetY =
            Number.isFinite(savedDetailY) && savedDetailY > 0 ? savedDetailY : 0;

        if (pagination.hasMore) {
            await loadMoreReplies();
            while (
                pagination.hasMore &&
                document.documentElement.scrollHeight < restoreTargetY + window.innerHeight
            ) {
                await loadMoreReplies();
            }
        } else {
            trigger.textContent = 'まだ返信はありません。';
        }

        if (pagination.hasMore) repliesLoadObserver.observe(trigger);
    } catch (e) {
        console.error('ポスト詳細表示エラー:', e);
        contentDiv.innerHTML = `<p class="error-message">ポストの読み込みに失敗しました。</p>`;
    } finally {
        showLoading(false);
    }
}

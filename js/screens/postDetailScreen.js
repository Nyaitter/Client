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

export async function showPostDetail(postId, options = {}, maybeShowScreenFn = null) {
    const normalizedPostId = Number(postId);
    if (!Number.isInteger(normalizedPostId) || normalizedPostId <= 0) {
        throw new Error('無効なポストIDです。');
    }

    let showScreenFn = maybeShowScreenFn;
    let forceRefresh = false;
    if (typeof options === 'function') {
        showScreenFn = options;
    } else if (options && typeof options === 'object') {
        forceRefresh = Boolean(options.forceRefresh);
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

        // ── 祖先（親チェーン）の解決とツリー描画 (無条件で表示) ──────────
        let ancestorsList = Array.isArray(threadPayload?.ancestors) ? [...threadPayload.ancestors] : [];
        if (ancestorsList.length === 0 && mainPost.reply_to_post) {
            let current = mainPost.reply_to_post;
            while (current) {
                ancestorsList.unshift(current);
                current = current.reply_to_post;
            }
        }

        let immediateParentEl = null;
        if (ancestorsList.length > 0) {
            const ancestorsContainer = document.createElement('div');
            ancestorsContainer.className = 'parent-posts-tree';

            for (let i = 0; i < ancestorsList.length; i++) {
                const ancestorPost = ancestorsList[i];
                const author = ancestorPost.author || ancestorPost.user || null;
                const ancestorEl = await renderPost(ancestorPost, author, {
                    userCache: getAllUsersCache(),
                    metricsPromise,
                    isThreadAncestor: true,
                });
                if (ancestorEl) {
                    const itemContainer = document.createElement('div');
                    itemContainer.className = 'parent-post-container';
                    itemContainer.appendChild(ancestorEl);
                    ancestorsContainer.appendChild(itemContainer);

                    // 対象ポストの直前の親（直近の親）を記録
                    if (i === ancestorsList.length - 1) {
                        immediateParentEl = itemContainer;
                    }
                }
            }
            contentDiv.appendChild(ancestorsContainer);
        }

        // ── メインポスト（現在の対象ポスト）の描画 ───────────────────────
        const mainPostEl = await renderPost(mainPost, mainPost.author, {
            userCache: getAllUsersCache(),
            metricsPromise,
            isMainPost: true,
        });
        if (mainPostEl) {
            if (ancestorsList.length > 0) {
                mainPostEl.classList.add('main-post-reply-focus');
            }
            contentDiv.appendChild(mainPostEl);
        }

        // ── 返信セクション ─────────────────────────────────────────────
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
        const mainPostAuthorId = Number(mainPost?.userId ?? mainPost?.user_id ?? mainPost?.author?.id);

        // ── 返信ブランチ（子ポスト＋孫ポスト群）の構築 ─────────────────
        const visitedReplyIds = new Set();
        const collectDescendants = (parentId, depth, chainAuthorIds, resultList) => {
            const children = repliesByParentId.get(Number(parentId)) || [];
            for (const child of children) {
                if (visitedReplyIds.has(child.id)) continue;

                const childAuthorId = Number(child.author?.id ?? child.author_id ?? child.userId ?? child.user_id);

                // 返信への返信（depth >= 1）は、返信者がポスト主または会話チェーン参加者（子ポスト主等）の場合にのみ表示
                if (depth >= 1) {
                    const isMainAuthor = Number.isInteger(mainPostAuthorId) && childAuthorId === mainPostAuthorId;
                    const isChainParticipant = Number.isInteger(childAuthorId) && chainAuthorIds.has(childAuthorId);

                    if (!isMainAuthor && !isChainParticipant) {
                        continue;
                    }
                }

                visitedReplyIds.add(child.id);
                resultList.push({ ...child, thread_depth: depth });

                const nextChainAuthorIds = new Set(chainAuthorIds);
                if (Number.isInteger(childAuthorId)) {
                    nextChainAuthorIds.add(childAuthorId);
                }
                collectDescendants(child.id, depth + 1, nextChainAuthorIds, resultList);
            }
        };

        const directChildren = repliesByParentId.get(rootPostId) || [];
        const replyBranches = [];

        for (const directReply of directChildren) {
            if (visitedReplyIds.has(directReply.id)) continue;
            visitedReplyIds.add(directReply.id);

            const directAuthorId = Number(directReply.author?.id ?? directReply.author_id ?? directReply.userId ?? directReply.user_id);
            const branchDescendants = [];
            const chainAuthorIds = new Set();
            if (Number.isInteger(directAuthorId)) {
                chainAuthorIds.add(directAuthorId);
            }

            collectDescendants(directReply.id, 1, chainAuthorIds, branchDescendants);

            replyBranches.push({
                directReply: { ...directReply, thread_depth: 0 },
                descendants: branchDescendants,
            });
        }

        const repliesContainer = document.createElement('div');
        contentDiv.appendChild(repliesContainer);
        const trigger = document.createElement('div');
        trigger.className = 'load-more-trigger';
        contentDiv.appendChild(trigger);

        let pagination = { page: 0, hasMore: replyBranches.length > 0 };
        const BRANCHES_PER_PAGE = 5;
        let isLoadingReplies = false;

        async function createReplyNode(reply) {
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

            if (!postEl) return null;

            if (replyDepth > 0) {
                const nestedWrapper = document.createElement('div');
                nestedWrapper.className = 'thread-nested-reply';
                // 1段インデントした後はさらに階層が深くなってもインデントしない (1段分固定)
                nestedWrapper.style.setProperty('--reply-indent', '2rem');
                nestedWrapper.dataset.replyDepth = String(replyDepth);
                nestedWrapper.appendChild(postEl);
                return nestedWrapper;
            }
            return postEl;
        }

        const loadMoreReplies = async () => {
            if (isLoadingReplies || !pagination.hasMore) return;
            isLoadingReplies = true;
            trigger.innerHTML = '<div class="spinner"></div>';

            const from = pagination.page * BRANCHES_PER_PAGE;
            const to = from + BRANCHES_PER_PAGE;
            const branchesToRender = replyBranches.slice(from, to);

            for (const branch of branchesToRender) {
                const branchContainer = document.createElement('div');
                branchContainer.className = 'thread-branch-container';

                // 1. 直下の子ポストをレンダリング
                const directNode = await createReplyNode(branch.directReply);
                if (directNode) {
                    branchContainer.appendChild(directNode);
                }

                // 2. 孫ポスト群（descendants）のレンダリング
                const descendants = branch.descendants || [];
                if (descendants.length === 1) {
                    // 孫ポストが1件のみの場合はそのまま表示
                    const childNode = await createReplyNode(descendants[0]);
                    if (childNode) branchContainer.appendChild(childNode);
                } else if (descendants.length >= 2) {
                    // 孫ポストが2件以上続く場合: 1件目を表示し、2件目以降を折りたたんで「続きを表示」ボタンを設置
                    const firstChildNode = await createReplyNode(descendants[0]);
                    if (firstChildNode) branchContainer.appendChild(firstChildNode);

                    const remainingDescendants = descendants.slice(1);
                    const collapsedContainer = document.createElement('div');
                    collapsedContainer.className = 'thread-collapsed-replies hidden';

                    for (const remainingReply of remainingDescendants) {
                        const remNode = await createReplyNode(remainingReply);
                        if (remNode) collapsedContainer.appendChild(remNode);
                    }

                    const showMoreBtn = document.createElement('button');
                    showMoreBtn.type = 'button';
                    showMoreBtn.className = 'thread-show-more-btn';
                    showMoreBtn.textContent = `続きを表示 (他 ${remainingDescendants.length} 件の返信)`;

                    showMoreBtn.addEventListener('click', () => {
                        collapsedContainer.classList.remove('hidden');
                        showMoreBtn.remove();
                    });

                    branchContainer.appendChild(showMoreBtn);
                    branchContainer.appendChild(collapsedContainer);
                }

                repliesContainer.appendChild(branchContainer);
            }

            pagination.page++;
            if (pagination.page * BRANCHES_PER_PAGE >= replyBranches.length) {
                pagination.hasMore = false;
            }

            if (!pagination.hasMore) {
                trigger.textContent = repliesContainer.hasChildNodes()
                    ? 'すべての返信を読み込みました'
                    : 'まだ返信はありません。';
                if (repliesLoadObserver) repliesLoadObserver.disconnect();
            } else {
                trigger.innerHTML = '';
                requestAnimationFrame(() => {
                    if (!pagination.hasMore || isLoadingReplies) return;
                    const rect = trigger.getBoundingClientRect();
                    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
                    if (rect.top <= vh + 300 && rect.bottom >= -300) {
                        void loadMoreReplies();
                    }
                });
            }
            isLoadingReplies = false;
        };

        const repliesLoadObserver = createViewportObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    void loadMoreReplies();
                }
            },
            { rootMargin: '300px' },
        );

        const savedDetailPosition =
            getSavedScrollPositions()[getScrollRouteKey()];
        const savedDetailY = Number(savedDetailPosition?.y);
        const hasSavedScroll = Number.isFinite(savedDetailY) && savedDetailY > 0;
        const restoreTargetY = hasSavedScroll ? savedDetailY : 0;

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

        // ── スクロール位置の初期設定 ─────────────────────────────────────
        // 過去のスクロール復元位置がない場合、返信の親の頭が画面上側に来るように位置を合わせる
        if (!hasSavedScroll && immediateParentEl) {
            requestAnimationFrame(() => {
                const headerEl = DOM.pageHeader;
                const headerOffset = headerEl ? headerEl.offsetHeight : 60;
                const rect = immediateParentEl.getBoundingClientRect();
                const targetTop = window.scrollY + rect.top - headerOffset;
                if (targetTop > 0) {
                    window.scrollTo({ top: Math.max(0, targetTop), behavior: 'instant' });
                }
            });
        }
    } catch (e) {
        console.error('ポスト詳細表示エラー:', e);
        contentDiv.innerHTML = `<p class="error-message">ポストの読み込みに失敗しました。</p>`;
    } finally {
        showLoading(false);
    }
}

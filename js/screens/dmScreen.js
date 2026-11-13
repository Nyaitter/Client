import { DOM } from '../dom.js';
import { t } from '../modules/i18n.js';
import { ICONS } from '../icons.js';
import { api, apiRequest } from '../api.js';
import { rankAvatarAttributes } from '../modules/rankAvatarIntegration.js';
import {
    getCurrentUser,
    getAllUsersCache,
    getDmUnreadCounts,
    setActiveDmId,
    setActiveDmMemberIds,
    setLastRenderedMessageId,
} from '../state.js';
import {
    getDmCacheKey,
    getScreenDataCache,
    setScreenDataCache,
    deleteScreenDataCache,
    invalidateDmCaches,
    cacheUser,
    cacheUsers,
} from '../modules/cache.js';
import {
    renderDmMessage,
    attachDmMessageClamp,
    initializeDmMessageClamps,
    flushRealtimeDmMessages,
    beginDmEditLoad,
    isCurrentDmEditLoad,
    setDmEditLoadPosts,
    flushDmEdits,
    handleDmButtonClick,
    handleUpdateDmTitle,
    handleRemoveDmMember,
    handleSetHostDmMember,
    handleAddDmMember,
    handleLeaveDm,
    handleDisbandDm,
    handleAcceptDmRequest,
    handleDeclineDmRequest,
    createDmRequestId,
} from '../modules/dm.js';
import { filterBlockedPosts, uploadFileViaEdgeFunction, deleteFilesViaEdgeFunction } from '../modules/posts.js';
import { getEmoji } from '../modules/format.js';
import { attachMarkdownContentEditor, getMarkdownEditorValue, setMarkdownEditorValue, setupMarkdownEditorPreviewButton } from '../modules/editor.js';
import { updateNavAndSidebars } from '../modules/sidebar.js';
import { initTabGroup } from '../modules/tabSwipe.js';

let dmListTabGroupController = null;
let activeDmReplySetter = null;

// The conversation container is a persistent shell element whose contents
// are re-rendered per conversation. Bind the reply delegates once and
// dispatch to the current conversation's setReply, so opening a
// conversation no longer stacks another anonymous handler pair on the
// container every time.

// Scroll the conversation to the message a reply points at, loading older
// history pages until it appears (or history stops growing), then flash it.
async function jumpToDmMessage(container, messageId) {
    const view = container.querySelector('.dm-conversation-view');
    if (!view || !messageId) return;
    const selector = `.dm-message-container[data-message-id="${CSS.escape(String(messageId))}"]`;
    let target = view.querySelector(selector);
    for (let attempt = 0; !target && attempt < 40; attempt += 1) {
        const loadMore = container._dmLoadMoreHistory;
        if (typeof loadMore !== 'function') break;
        const before = view.querySelectorAll('.dm-message-container').length;
        await loadMore();
        if (!view.isConnected) return;
        target = view.querySelector(selector);
        if (view.querySelectorAll('.dm-message-container').length === before) break;
    }
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('dm-message-highlight');
    void target.offsetWidth;
    target.classList.add('dm-message-highlight');
    setTimeout(() => target.classList.remove('dm-message-highlight'), 2000);
}

function ensureDmConversationDelegates(container) {
    if (container.dataset.dmReplyDelegatesBound === '1') return;
    container.dataset.dmReplyDelegatesBound = '1';
    container.addEventListener('click', (event) => {
        const reference = event.target.closest('.dm-reply-reference');
        if (reference?.dataset.replyTargetId) {
            void jumpToDmMessage(container, reference.dataset.replyTargetId);
            return;
        }
        const button = event.target.closest('.reply-dm-msg-btn');
        const message = button?.closest('.dm-message-container.received');
        if (!message?.dataset.messageId) return;
        button.closest('.post-menu')?.classList.remove('is-visible');
        activeDmReplySetter?.(message);
    });
    container.addEventListener('dblclick', (event) => {
        if (event.target.closest('button, a, video, audio, .post-menu')) return;
        const message = event.target.closest('.dm-message')?.closest('.dm-message-container.received');
        if (message?.querySelector('.reply-dm-msg-btn')) activeDmReplySetter?.(message);
    });
}
import { sendNotification } from '../modules/notifications.js';
import { createViewportObserver } from '../utils/viewport.js';
import {
    getScrollRouteKey,
    saveScrollPosition,
    restoreScrollPosition,
    saveElementScrollPosition,
    restoreElementScrollPosition,
    getSavedScrollTargetY,
} from '../modules/scroll.js';
import {
    escapeHTML,
    getNyaitterId,
    getUserIconUrl,
    showLoading,
    showAppAlert,
    showAppConfirm,
    scheduleNextFrame,
} from '../utils/helpers.js';

import { showScreenCompat } from '../screenManager.js';

let activeDmListTab = 'inbox';

function getAcceptedDmMemberIds(dm) {
    let accepted = dm?.accepted ?? dm?.unread?._accepted;
    if (typeof accepted === 'string') {
        try {
            accepted = JSON.parse(accepted);
        } catch (_) {
            accepted = null;
        }
    }
    if (!Array.isArray(accepted)) return null;
    return accepted
        .map((member) => member && typeof member === 'object'
            ? (member.id ?? member.user_id ?? member.userId)
            : member)
        .map(Number)
        .filter((id) => Number.isInteger(id) && id >= 0);
}

function isDmPending(dm) {
    const currentUserId = getCurrentUser()?.id;
    if (typeof dm?.is_accepted === 'boolean') return !dm.is_accepted;
    const accepted = getAcceptedDmMemberIds(dm);
    if (accepted && currentUserId != null) {
        return !accepted.includes(Number(currentUserId));
    }
    return Boolean(dm?.is_pending);
}

function renderDmListItem(dm, unreadCount, currentUserId) {
    const members = Array.isArray(dm.member) ? dm.member : [];
    const otherMemberIds = members.filter((id) => Number(id) !== Number(currentUserId));
    const otherUsers = otherMemberIds.map((id) => getAllUsersCache().get(id)).filter(Boolean);

    let title = dm.title;
    let subtitle = '';
    let avatarHtml = '';

    if (otherUsers.length === 1) {
        const otherUser = otherUsers[0];
        if (!title) title = otherUser.name || t('dm.user_number', { id: otherUser.id });
        subtitle = getNyaitterId(otherUser);
        avatarHtml = `<img ${rankAvatarAttributes(otherUser)} src="${getUserIconUrl(otherUser)}" class="dm-list-item-avatar nui-avatar" alt="">`;
    } else if (otherUsers.length > 1) {
        if (!title) {
            title = otherUsers.map((u) => u.name || `#${u.id}`).join(', ');
        }
        subtitle = t('dm.members', { count: members.length });
        const firstAvatar = otherUsers[0] ? getUserIconUrl(otherUsers[0]) : getUserIconUrl({});
        const secondAvatar = otherUsers[1] ? getUserIconUrl(otherUsers[1]) : getUserIconUrl({});
        avatarHtml = `<div class="dm-group-avatar-stack">
            <img ${rankAvatarAttributes(otherUsers[0])} src="${firstAvatar}" class="dm-list-item-avatar nui-avatar dm-group-avatar-1" alt="">
            <img ${rankAvatarAttributes(otherUsers[1])} src="${secondAvatar}" class="dm-list-item-avatar nui-avatar dm-group-avatar-2" alt="">
        </div>`;
    } else {
        if (!title) title = t('dm.only_self');
        subtitle = t('dm.private_memo');
        avatarHtml = `<img ${rankAvatarAttributes(getCurrentUser())} src="${getUserIconUrl(getCurrentUser())}" class="dm-list-item-avatar nui-avatar" alt="">`;
    }

    if (isDmPending(dm)) {
        subtitle = subtitle ? `${subtitle} · ${t('dm.request_suffix')}` : t('dm.request');
    }

    const dmIdStr = escapeHTML(String(dm.id));
    const titleEscaped = getEmoji(escapeHTML(title || t('dm.fallback_title')));

    return `
        <article class="dm-list-item nui-list-item ${unreadCount > 0 ? 'is-unread' : ''}" data-nui="list-item" data-action="open-dm" data-dm-id="${dmIdStr}">
            <div class="dm-list-item-avatar-wrap">
                ${avatarHtml}
                ${unreadCount > 0 ? `<span class="dm-avatar-unread-badge">${unreadCount}</span>` : ''}
            </div>
            <div class="dm-list-item-main nui-list-copy">
                <div class="dm-list-item-header">
                    <span class="dm-list-item-title nui-list-title">${titleEscaped}</span>
                </div>
                ${subtitle ? `<div class="dm-list-item-sub nui-list-meta">${escapeHTML(subtitle)}</div>` : ''}
            </div>
            <button type="button" class="dm-manage-btn" title="${t('dm.manage')}" aria-label="${t('dm.manage')}" data-action="open-dm-manage" data-dm-id="${dmIdStr}">${ICONS.more}</button>
        </article>
    `;
}

export async function showDmScreen(dmId = null, showScreenFn = null) {
    if (!getCurrentUser()) {
        window.location.hash = '#';
        return;
    }
    showScreenCompat('dm-screen', showScreenFn);

    const contentDiv = DOM.dmContent;

    if (dmId) {
        renderConversationShell(contentDiv);
        await showDmConversation(dmId);
    } else {
        renderListHeader();
        renderListShell(contentDiv, activeDmListTab);
        const tabsContainer = contentDiv.querySelector('.dm-tabs-container');
        const badgeEl = document.getElementById('dm-request-tab-badge');
        const listItemsWrapper = document.getElementById('dm-list-items-wrapper');

        try {
            const dmListCacheKey = getDmCacheKey('list');
            let dmPayload = getScreenDataCache(dmListCacheKey);
            if (!dmPayload) {
                const { data, error } = await apiRequest('/server/api/dm');
                if (error) throw error;
                dmPayload = data || {};
                setScreenDataCache(dmListCacheKey, dmPayload);
            }
            const dmList = Array.isArray(dmPayload?.dm) ? dmPayload.dm : [];
            const unreadCountsMap = getDmUnreadCounts();
            unreadCountsMap.clear();
            dmList.forEach((dm) =>
                unreadCountsMap.set(String(dm.id), Number(dm.unread_count || 0)),
            );
            for (const member of dmPayload?.members || []) {
                cacheUser(member);
            }
            getCurrentUser().unreadDmTotal = Number(dmPayload?.unread_total || 0);
            void updateNavAndSidebars();

            const inboxDms = dmList.filter((d) => !isDmPending(d));
            const requestDms = dmList.filter((d) => isDmPending(d));

            if (badgeEl) {
                if (requestDms.length > 0) {
                    badgeEl.textContent = String(requestDms.length);
                    badgeEl.classList.remove('hidden');
                } else {
                    badgeEl.classList.add('hidden');
                }
            }

            let listObserver = null;
            const DM_LIST_PAGE_SIZE = 25;

            const renderListForTab = (tab) => {
                if (listObserver) {
                    listObserver.disconnect();
                    listObserver = null;
                }
                activeDmListTab = tab;
                const currentList = tab === 'requests' ? requestDms : inboxDms;
                if (currentList.length === 0) {
                    listItemsWrapper.innerHTML = tab === 'requests'
                        ? `
                            <div class="dm-empty-state nui-empty-text">
                                <p class="settings-help-text nui-help-text">${t('dm.no_requests')}</p>
                            </div>
                        `
                        : `
                            <div class="dm-empty-state nui-empty-text">
                                <p class="settings-help-text nui-help-text">${t('dm.empty')}</p>
                                <button type="button" class="settings-primary-button dm-empty-create-btn nui-button" data-nui="button" data-action="open-create-dm">${t('dm.new')}</button>
                            </div>
                        `;
                } else {
                    const currentUserId = getCurrentUser().id;
                    let renderedCount = 0;

                    const renderNextChunk = () => {
                        const nextChunk = currentList.slice(renderedCount, renderedCount + DM_LIST_PAGE_SIZE);
                        if (nextChunk.length === 0) return;
                        const chunkHtml = nextChunk
                            .map((dm) => {
                                const unreadCount = unreadCountsMap.get(String(dm.id)) || 0;
                                return renderDmListItem(dm, unreadCount, currentUserId);
                            })
                            .join('');
                        renderedCount += nextChunk.length;

                        const trigger = listItemsWrapper.querySelector('.dm-list-load-more');
                        if (trigger) {
                            trigger.insertAdjacentHTML('beforebegin', chunkHtml);
                        } else {
                            listItemsWrapper.insertAdjacentHTML('beforeend', chunkHtml);
                        }

                        const existingTrigger = listItemsWrapper.querySelector('.dm-list-load-more');
                        if (renderedCount < currentList.length) {
                            if (!existingTrigger) {
                                const newTrigger = document.createElement('div');
                                newTrigger.className = 'dm-list-load-more';
                                listItemsWrapper.appendChild(newTrigger);
                                listObserver = createViewportObserver((entries) => {
                                    if (entries[0].isIntersecting) {
                                        renderNextChunk();
                                    }
                                });
                                listObserver.observe(newTrigger);
                            }
                        } else if (existingTrigger) {
                            existingTrigger.remove();
                            if (listObserver) listObserver.disconnect();
                        }
                    };

                    listItemsWrapper.innerHTML = '';
                    renderNextChunk();
                }

                restoreScrollPosition(getScrollRouteKey('#dm', tab));
            };

            dmListTabGroupController?.destroy();
            dmListTabGroupController = initTabGroup({
                container: tabsContainer,
                tabSelector: '.dm-tab-button',
                contentContainer: listItemsWrapper,
                getTabKey: (btn) => btn.dataset.dmTab,
                onTabChange: (tab) => {
                    saveScrollPosition(getScrollRouteKey('#dm', activeDmListTab));
                    renderListForTab(tab);
                },
                onRefresh: async () => {
                    deleteScreenDataCache(dmListCacheKey);
                    await showDmScreen();
                },
            });

            renderListForTab(activeDmListTab);
            listItemsWrapper.classList.remove('spinner');
        } catch (e) {
            console.error('DMリストの読み込みに失敗:', e);
            listItemsWrapper.innerHTML =
                '<p class="error-message">' + t('dm.load_failed') + '</p>';
            listItemsWrapper.classList.remove('spinner');
        } finally {
            showLoading(false);
        }
    }
}

export async function showDmConversation(dmId, { unreadBefore = null, refreshAttempt = 0 } = {}) {
    const container = document.getElementById('dm-conversation-container');
    if (!container) return;
    const dmConversationCacheKey = getDmCacheKey('conversation', String(dmId));
    const editLoad = beginDmEditLoad(dmId, {
        useCached: Boolean(getScreenDataCache(dmConversationCacheKey)),
    });
    container.innerHTML = '<div class="spinner"></div>';

    let dmSelectedFiles = [];
    let carriedUnreadBefore = unreadBefore;
    let refreshPromise = null;

    const reloadConversation = () => {
        if (refreshPromise) return refreshPromise;
        deleteScreenDataCache(dmConversationCacheKey);
        if (refreshAttempt < 1) {
            refreshPromise = showDmConversation(dmId, {
                unreadBefore: carriedUnreadBefore,
                refreshAttempt: refreshAttempt + 1,
            });
            return refreshPromise;
        }
        if (isCurrentDmEditLoad(editLoad)) {
            container.innerHTML = `
                <div class="error-message" role="alert" style="margin:2rem;">
                    ${t('dm.refresh_failed')}
                    <button type="button" class="dm-refresh-retry-btn">${t('common.retry')}</button>
                </div>`;
            container.querySelector('.dm-refresh-retry-btn')?.addEventListener('click', () => {
                void showDmConversation(dmId, { unreadBefore: carriedUnreadBefore });
            }, { once: true });
        }
        return Promise.resolve();
    };
    editLoad.onStale = () => {
        queueMicrotask(() => {
            if (isCurrentDmEditLoad(editLoad) && editLoad.awaitingFresh) void reloadConversation();
        });
    };

    try {
        let dmPayload = editLoad.useCache ? getScreenDataCache(dmConversationCacheKey) : null;
        // 編集を捨てた会話はキャッシュに戻さず、サーバーの最新内容で作り直す。
        // 描画後に保留中の編集を反映する。作り直しが必要なら false、表示が切り替わっていれば null。
        const applyPendingEdits = async (load) => {
            const applied = await flushDmEdits(load, {
                discardIfStale: true,
                isRenderActive: () => isCurrentDmEditLoad(load),
            });
            if (!isCurrentDmEditLoad(load)) return null;
            if (!applied && load.awaitingFresh) {
                await reloadConversation();
                return null;
            }
            await flushRealtimeDmMessages(dm.id);
            if (!isCurrentDmEditLoad(load)) return null;
            if (!applied && load.awaitingFresh) {
                await reloadConversation();
                return null;
            }
            return true;
        };
        let error = null;
        const usedCachedPayload = Boolean(dmPayload);
        let cachedUnreadBefore = carriedUnreadBefore ?? 0;
        let readSucceeded = !usedCachedPayload;

        if (!dmPayload) {
            const result = await apiRequest(`/server/api/dm/${encodeURIComponent(dmId)}?mark_read=1`);
            dmPayload = result.data || {};
            error = result.error;
            // 再取得待ちの初回レスポンスを、古い内容のままキャッシュへ戻さない。
            if (!error && !editLoad.awaitingFresh && !editLoad.refreshing) {
                setScreenDataCache(dmConversationCacheKey, dmPayload);
            }
        } else {
            const key = String(dmId);
            cachedUnreadBefore = Number(getDmUnreadCounts().get(key) || carriedUnreadBefore || 0);
            // 再取得前のキャッシュは編集を破棄している可能性があるため既読扱いにしない。
            const keepUnread = editLoad.refreshing;
            if (cachedUnreadBefore > 0 && !keepUnread) {
                getDmUnreadCounts().set(key, 0);
                getCurrentUser().unreadDmTotal = Math.max(
                    0,
                    Number(getCurrentUser().unreadDmTotal || 0) - cachedUnreadBefore,
                );
                deleteScreenDataCache(getDmCacheKey('list'));
                void updateNavAndSidebars();
            }
            if (cachedUnreadBefore > 0) {
                // /read の完了を待たずにバックグラウンドで非同期送信
                void apiRequest(
                    `/server/api/dm/${encodeURIComponent(dmId)}/read`,
                    { method: 'POST' },
                ).catch((readErr) => {
                    console.warn('DM既読化バックグラウンド送信失敗:', readErr);
                });
            }
        }

        if (!isCurrentDmEditLoad(editLoad)) return;
        const dm = Array.isArray(dmPayload?.dm) ? dmPayload.dm[0] : null;
        // 再取得ではキャッシュ経由の既読処理が無いため、前回の未読数を引き継ぐ。
        carriedUnreadBefore = cachedUnreadBefore;
        for (const member of dmPayload?.members || []) {
            cacheUser(member);
        }
        const memberList = Array.isArray(dm?.member) ? dm.member.map(Number) : [];
        setActiveDmMemberIds(memberList);
        if (!usedCachedPayload) {
            getCurrentUser().unreadDmTotal = Number(dmPayload?.unread_total || 0);
        }
        if (dm) {
            if (!editLoad.refreshing) getDmUnreadCounts().set(String(dm.id), 0);
            deleteScreenDataCache(getDmCacheKey('list'));
            if (!error) void updateNavAndSidebars();
        }
        if (error && (editLoad.awaitingFresh || editLoad.refreshing)) {
            await reloadConversation();
            return;
        }
        if (error || !dm || !dm.member.includes(getCurrentUser().id)) {
            DOM.pageHeader.innerHTML = `
                <div class="header-with-back-button">
                    <button class="header-back-btn" data-action="history-back">${ICONS.back}</button>
                    <h2 id="page-title">${t('common.error')}</h2>
                </div>`;
            container.innerHTML =
                '<p class="error-message" style="margin:2rem;">' + t('dm.not_found') + '</p>';
            showLoading(false);
            return;
        }

        // 会話ヘッダーのタイトルとサブタイトル生成
        const otherMemberIds = memberList.filter((id) => id !== Number(getCurrentUser().id));
        const otherUsers = otherMemberIds.map((id) => getAllUsersCache().get(id)).filter(Boolean);
        let headerTitle = dm.title;
        let headerSubtitle = '';
        if (otherUsers.length === 1) {
            if (!headerTitle) headerTitle = otherUsers[0].name || t('dm.user_number', { id: otherUsers[0].id });
            headerSubtitle = getNyaitterId(otherUsers[0]);
        } else if (otherUsers.length > 1) {
            if (!headerTitle) headerTitle = otherUsers.map((u) => u.name || `#${u.id}`).join(', ');
            headerSubtitle = t('dm.members', { count: memberList.length });
        } else {
            if (!headerTitle) headerTitle = t('dm.only_self');
            headerSubtitle = t('dm.private_memo');
        }

        DOM.pageHeader.innerHTML = `
            <div class="header-with-back-button dm-header-container">
                <button class="header-back-btn" data-action="history-back" aria-label="${t('common.back')}">${ICONS.back}</button>
                <div class="dm-header-titles">
                    <h2 id="page-title" class="dm-header-title">${getEmoji(escapeHTML(headerTitle))}</h2>
                    <span class="dm-header-subtitle">${escapeHTML(headerSubtitle)}</span>
                </div>
                <button type="button" class="dm-manage-btn" title="${t('dm.join_call')}" aria-label="${t('dm.join_call')}" data-action="join-dm-call" data-dm-id="${escapeHTML(String(dm.id))}">${ICONS.phone}</button>
                <button type="button" class="dm-manage-btn" title="${t('dm.manage')}" aria-label="${t('dm.manage')}" data-action="open-dm-manage" data-dm-id="${escapeHTML(String(dm.id))}">${ICONS.more}</button>
            </div>
        `;

        setActiveDmId(String(dm.id));
        let posts = dm.post || [];
        posts = filterBlockedPosts(posts);
        setDmEditLoadPosts(editLoad, posts, {
            fromCache: usedCachedPayload,
            mergeErrors: Boolean(error),
        });
        // 再取得は同じ表示を継続できるよう、読み込み用の変数ではなく記録した状態で判定する。
        if (editLoad.awaitingFresh || editLoad.refreshing) {
            await reloadConversation();
            return;
        }
        if (!error && !usedCachedPayload) setScreenDataCache(dmConversationCacheKey, dmPayload);
        const allUserIdsInDm = new Set(dm.member);

        posts.forEach((msg) => {
            if (msg.userid) allUserIdsInDm.add(msg.userid);
            if (msg.content) {
                for (const match of msg.content.matchAll(/@(\d+)/g)) {
                    allUserIdsInDm.add(parseInt(match[1], 10));
                }
            }
        });

        const newIdsToFetch = [...allUserIdsInDm].filter(
            (id) => id && !getAllUsersCache().has(id),
        );
        if (newIdsToFetch.length > 0) {
            const { data: users } = await api
                .from('user')
                .select('id, name, scid, icon_data')
                .in('id', newIdsToFetch);
            if (users) cacheUsers(users);
        }
        if (!isCurrentDmEditLoad(editLoad)) return;

        const DM_CONVERSATION_PAGE_SIZE = 30;
        const initialSlice = posts.slice(Math.max(0, posts.length - DM_CONVERSATION_PAGE_SIZE));
        let loadedCount = initialSlice.length;

        const messagesHTMLArray = await Promise.all(
            initialSlice.slice().reverse().map((msg) => renderDmMessage(msg, dm.id, posts)),
        );
        const messagesHTML = messagesHTMLArray.join('');
        if (!isCurrentDmEditLoad(editLoad)) return;

        const isPending = isDmPending(dm);

        if (isPending) {
            container.innerHTML = `
                <div class="dm-conversation-view">${messagesHTML}</div>
                <div class="dm-request-approval-banner">
                    <div class="dm-request-approval-info">
                        <span class="dm-request-approval-badge">${t('dm.request')}</span>
                        <p class="dm-request-approval-text">${t('dm.request_text_prefix')}${getEmoji(escapeHTML(headerTitle))}${t('dm.request_text_suffix')}</p>
                    </div>
                    <div class="dm-request-approval-actions">
                        <button type="button" class="dm-request-btn dm-request-decline-btn nui-button-secondary" data-nui="button-secondary" id="dm-decline-request-btn">${t('dm.decline_delete')}</button>
                        <button type="button" class="dm-request-btn dm-request-accept-btn nui-button" data-nui="button" id="dm-accept-request-btn">${t('dm.accept')}</button>
                    </div>
                </div>
            `;

            void updateNavAndSidebars();
            if (await applyPendingEdits(editLoad) === null) return;
            initializeDmMessageClamps(container);

            document.getElementById('dm-accept-request-btn')?.addEventListener('click', async () => {
                await handleAcceptDmRequest(dm.id, async () => {
                    deleteScreenDataCache(getDmCacheKey('conversation', String(dm.id)));
                    deleteScreenDataCache(getDmCacheKey('list'));
                    await showDmConversation(dm.id);
                });
            });

            document.getElementById('dm-decline-request-btn')?.addEventListener('click', async () => {
                await handleDeclineDmRequest(dm.id, async () => {
                    deleteScreenDataCache(getDmCacheKey('conversation', String(dm.id)));
                    deleteScreenDataCache(getDmCacheKey('list'));
                    window.location.hash = '#dm';
                });
            });
        } else {
            container.innerHTML = `
                <div class="dm-conversation-view">${messagesHTML}</div>
                <div class="dm-message-form">
                    <div class="dm-form-content">
                        <div class="dm-reply-mode" hidden title="${t('dm.reply_jump')}">
                            <span class="dm-reply-mode-icon" aria-hidden="true">${ICONS.reply}</span>
                            <span class="dm-reply-mode-main">
                                <span class="dm-reply-mode-heading">${t('dm.replying')}</span>
                                <span class="dm-reply-mode-target">${t('dm.reply_to_message')}</span>
                            </span>
                            <button type="button" class="dm-reply-cancel" aria-label="${t('dm.reply_cancel')}">×</button>
                        </div>
                        <div class="file-preview-container dm-file-preview"></div>
                        <div class="markdown-textarea-editor dm-content-editor">
                            <textarea id="dm-message-input" class="markdown-content-editor" rows="1" spellcheck="true" data-markdown-content-editor data-server-input-limit="dm_content_length" placeholder="${t('dm.input_placeholder')}"></textarea>
                            <div class="markdown-editor-paint" aria-hidden="true">
                                <div class="markdown-editor-placeholder"></div>
                                <div class="markdown-editor-preview hidden"></div>
                                <div class="markdown-editor-selection"></div>
                                <div class="markdown-editor-composition"></div>
                                <div class="markdown-editor-caret"></div>
                            </div>
                        </div>
                    </div>
                    <div class="dm-form-actions">
                        <button type="button" id="dm-attachment-btn" class="attachment-button dm-action-btn" title="${t('composer.attach')}">${ICONS.attachment}</button>
                        <input type="file" id="dm-file-input" class="hidden" multiple>
                        <button type="button" id="send-dm-btn" class="dm-send-action-btn" title="${t('dmscreen.send_title')}">${ICONS.send}</button>
                    </div>
                </div>
            `;

            void updateNavAndSidebars();
            if (await applyPendingEdits(editLoad) === null) return;
            initializeDmMessageClamps(container);

            let messageInput = document.getElementById('dm-message-input');
            messageInput = attachMarkdownContentEditor(messageInput) || messageInput;
            setupMarkdownEditorPreviewButton(container, messageInput);
            const fileInput = document.getElementById('dm-file-input');
            const previewContainer = container.querySelector('.file-preview-container');
            const replyMode = container.querySelector('.dm-reply-mode');
            let replyTo = null;
            const setReply = (message) => {
                replyTo = message?.dataset.messageId || null;
                replyMode.hidden = !replyTo;
                replyMode.dataset.replyTargetId = replyTo || '';
                const targetLabel = replyMode.querySelector('.dm-reply-mode-target');
                if (replyTo && message.dataset.replyPreviewSafe === 'true') {
                    const name = message.querySelector('.dm-user-name')?.textContent?.trim() || t('dm.unknown_name');
                    const content = message.querySelector('.dm-message-content')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || t('dm.fallback_title');
                    targetLabel.textContent = `${name}: ${content}`;
                } else {
                    targetLabel.textContent = t('dm.reply_to_message');
                }
                messageInput?.focus();
            };
            replyMode.querySelector('.dm-reply-cancel').addEventListener('click', () => setReply(null));
            replyMode.addEventListener('click', (event) => {
                if (event.target.closest('.dm-reply-cancel')) return;
                const targetId = replyMode.dataset.replyTargetId;
                if (targetId) void jumpToDmMessage(container, targetId);
            });
            activeDmReplySetter = setReply;
            ensureDmConversationDelegates(container);

            document.getElementById('dm-attachment-btn')?.addEventListener('click', () => {
                fileInput?.click();
            });

            const renderSelectedFiles = () => {
                previewContainer.innerHTML = '';
                dmSelectedFiles.forEach((file, index) => {
                    const previewItem = document.createElement('div');
                    previewItem.className = 'file-preview-item';

                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            previewItem.innerHTML = `<img src="${e.target.result}" alt="${escapeHTML(file.name)}"><button class="file-preview-remove" data-index="${index}">×</button>`;
                        };
                        reader.readAsDataURL(file);
                    } else if (file.type.startsWith('video/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            previewItem.innerHTML = `<video src="${e.target.result}" style="width:100px; height:100px; object-fit:cover;" controls></video><button class="file-preview-remove" data-index="${index}">×</button>`;
                        };
                        reader.readAsDataURL(file);
                    } else if (file.type.startsWith('audio/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            previewItem.innerHTML = `<audio src="${e.target.result}" controls></audio><button class="file-preview-remove" data-index="${index}">×</button>`;
                        };
                        reader.readAsDataURL(file);
                    } else {
                        previewItem.innerHTML = `<div class="file-icon-placeholder">${ICONS.attachment} <span>${escapeHTML(file.name)}</span></div><button class="file-preview-remove" data-index="${index}">×</button>`;
                    }
                    previewContainer.appendChild(previewItem);
                });
            };

            fileInput?.addEventListener('change', (event) => {
                dmSelectedFiles = Array.from(event.target.files);
                renderSelectedFiles();
            });

            messageInput?.addEventListener('paste', (event) => {
                const pastedFiles = Array.from(event.clipboardData?.items || [])
                    .filter((item) => item.kind === 'file')
                    .map((item, index) => {
                        const file = item.getAsFile();
                        if (!file) return null;
                        if (file.name) return file;
                        const extension = item.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
                        return new File([file], `pasted-file-${Date.now()}-${index}.${extension}`, {
                            type: item.type || 'application/octet-stream',
                        });
                    })
                    .filter(Boolean);
                if (pastedFiles.length === 0) return;

                event.preventDefault();
                dmSelectedFiles.push(...pastedFiles);
                renderSelectedFiles();
            });

            previewContainer?.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.file-preview-remove');
                if (removeBtn) {
                    const index = parseInt(removeBtn.dataset.index, 10);
                    dmSelectedFiles.splice(index, 1);
                    renderSelectedFiles();
                }
            });

            const sendMessageAction = async () => {
                if (document.getElementById('send-dm-btn')?.disabled) return;
                const filesToSend = [...dmSelectedFiles];
                const content = getMarkdownEditorValue(messageInput).trim();
                if ((!content && filesToSend.length === 0) || content.length > 2000) {
                    if (content.length > 2000) showAppAlert(t('dmscreen.content_too_long'));
                    return;
                }
                dmSelectedFiles = [];
                if (fileInput) fileInput.value = '';
                if (previewContainer) previewContainer.innerHTML = '';
                const result = await sendDirectMessage(dmId, headerTitle, filesToSend, replyTo);
                if (result === 'sent') setReply(null);
                if (result === 'not-sent' && messageInput?.isConnected) {
                    dmSelectedFiles.unshift(...filesToSend);
                    renderSelectedFiles();
                }
            };

            messageInput?.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void sendMessageAction();
                }
            });
            document.getElementById('send-dm-btn')?.addEventListener('click', () => {
                void sendMessageAction();
            });
        }

        const conversationView = container.querySelector('.dm-conversation-view');
        if (conversationView) {
            container._dmLoadMoreHistory = null;
            // 過去メッセージのページネーションローダー
            if (posts.length > loadedCount) {
                const loadMoreContainer = document.createElement('div');
                loadMoreContainer.className = 'dm-load-more-container';
                const loadMoreBtn = document.createElement('button');
                loadMoreBtn.type = 'button';
                loadMoreBtn.className = 'dm-load-more-btn';
                loadMoreBtn.textContent = t('dm.load_older');
                loadMoreContainer.appendChild(loadMoreBtn);
                conversationView.appendChild(loadMoreContainer);

                let isLoadingMoreHistory = false;
                const loadMoreHistory = async () => {
                    if (isLoadingMoreHistory || loadedCount >= posts.length) return;
                    isLoadingMoreHistory = true;
            loadMoreBtn.textContent = t('common.loading');

                    try {
                        const nextSlice = posts.slice(
                            Math.max(0, posts.length - loadedCount - DM_CONVERSATION_PAGE_SIZE),
                            posts.length - loadedCount,
                        );
                        if (nextSlice.length > 0) {
                            const nextHtmlArray = await Promise.all(
                                nextSlice.slice().reverse().map((msg) => renderDmMessage(msg, dm.id, posts)),
                            );
                            if (!isCurrentDmEditLoad(editLoad) || !loadMoreContainer.isConnected) return;
                            loadMoreContainer.insertAdjacentHTML('beforebegin', nextHtmlArray.join(''));
                            if (await applyPendingEdits(editLoad) === null) return;
                            if (editLoad.awaitingFresh) {
                                // 追加ぶんに古い内容が含まれるため、取得し直して表示する。
                                invalidateDmCaches(dmId);
                                await reloadConversation();
                                return;
                            }
                            loadedCount += nextSlice.length;
                            initializeDmMessageClamps(conversationView);
                        }
                        if (loadedCount >= posts.length) {
                            loadMoreContainer.remove();
                        } else {
                            loadMoreBtn.textContent = t('dm.load_older');
                        }
                    } catch (err) {
                        if (!isCurrentDmEditLoad(editLoad)) return;
                        if (editLoad.awaitingFresh) {
                            invalidateDmCaches(dmId);
                            await reloadConversation();
                            return;
                        }
                        console.error('過去メッセージの読み込みエラー:', err);
                        loadMoreBtn.textContent = t('dmscreen.load_failed_retry');
                    } finally {
                        isLoadingMoreHistory = false;
                    }
                };

                loadMoreBtn.addEventListener('click', () => void loadMoreHistory());
                container._dmLoadMoreHistory = loadMoreHistory;

                container._dmHistoryObserver?.disconnect();
                const historyObserver = createViewportObserver((entries) => {
                    if (entries[0].isIntersecting) {
                        void loadMoreHistory();
                    }
                });
                historyObserver.observe(loadMoreContainer);
                container._dmHistoryObserver = historyObserver;
            }

            // スクロール位置の保存と復元
            conversationView.addEventListener('scroll', () => {
                saveElementScrollPosition(conversationView, `dm_${dm.id}`);
            }, { passive: true });

            const savedY = getSavedScrollTargetY(`el:dm_${dm.id}`);
            if (savedY > 0) {
                restoreElementScrollPosition(conversationView, `dm_${dm.id}`);
            } else {
                scheduleNextFrame(() => {
                    if (conversationView && conversationView.isConnected) {
                        conversationView.scrollTop = conversationView.scrollHeight;
                    }
                });
            }
        }

        setLastRenderedMessageId(posts.length > 0 ? posts[posts.length - 1].id : null);
    } catch (e) {
        if (!isCurrentDmEditLoad(editLoad)) return;
        console.error('DM会話の読み込みに失敗:', e);
        if (editLoad.awaitingFresh || editLoad.refreshing) {
            deleteScreenDataCache(getDmCacheKey('conversation', String(dmId)));
            container.innerHTML = `
                <div class="error-message" role="alert" style="margin:2rem;">
                    ${t('dm.refresh_failed')}
                    <button type="button" class="dm-refresh-retry-btn">${t('common.retry')}</button>
                </div>`;
            container.querySelector('.dm-refresh-retry-btn')?.addEventListener('click', () => {
                void showDmConversation(dmId, { unreadBefore: carriedUnreadBefore });
            }, { once: true });
            return;
        }
        container.innerHTML = `<p class="error-message">${t('dmscreen.messages_load_failed')}</p>`;
    } finally {
        if (isCurrentDmEditLoad(editLoad)) showLoading(false);
    }
}

async function sendDirectMessage(dmId, conversationTitle, files = [], replyTo = null) {
    const input = document.getElementById('dm-message-input');
    const content = getMarkdownEditorValue(input).trim();
    if (!content && files.length === 0) return;
    if (content.length > 2000) {
        showAppAlert(t('dmscreen.content_too_long'));
        return;
    }

    const sendButton = document.getElementById('send-dm-btn');
    if (input) input.disabled = true;
    if (sendButton) sendButton.disabled = true;

    // 入力欄をクリア
    setMarkdownEditorValue(input, '');

    let uploadedFileIds = [];
    let attachmentsData = [];
    let optimisticEl = null;
    let sendStarted = false;

    try {
        for (const file of files) {
            const fileId = await uploadFileViaEdgeFunction(file);
            uploadedFileIds.push(fileId);
            const fileType = file.type.startsWith('image/')
                ? 'image'
                : file.type.startsWith('video/')
                  ? 'video'
                  : file.type.startsWith('audio/')
                    ? 'audio'
                    : 'file';
            attachmentsData.push({
                type: fileType,
                id: fileId,
                name: file.name,
            });
        }

        const messageObject = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: 'user',
            userid: getCurrentUser().id,
            content: content,
            message: content,
            attachments: attachmentsData,
            created_at: new Date().toISOString(),
            ...(replyTo ? { reply_to: replyTo } : {}),
        };

        // キャッシュ内のdm会話データ（楽観表示で返信先を解決するためにも先に読む）
        const dmConversationCacheKey = getDmCacheKey('conversation', String(dmId));
        const cachedPayload = getScreenDataCache(dmConversationCacheKey);
        const cachedPosts = Array.isArray(cachedPayload?.dm?.[0]?.post) ? cachedPayload.dm[0].post : [];

        // 楽観的にDOMへメッセージを追加
        const view = document.querySelector('.dm-conversation-view');
        if (view && input?.isConnected) {
            const messageHtml = await renderDmMessage(messageObject, dmId, cachedPosts);
            if (input.isConnected && view.isConnected) {
                view.insertAdjacentHTML('afterbegin', messageHtml);
                initializeDmMessageClamps(view);
                optimisticEl = view.querySelector(`[data-message-id="${messageObject.id}"]`);
            }
        }

        if (input?.isConnected) setLastRenderedMessageId(messageObject.id);

        // キャッシュ内のdm会話データにも追加
        if (cachedPayload && Array.isArray(cachedPayload.dm) && cachedPayload.dm[0]) {
            if (!Array.isArray(cachedPayload.dm[0].post)) {
                cachedPayload.dm[0].post = [];
            }
            cachedPayload.dm[0].post.push(messageObject);
            setScreenDataCache(dmConversationCacheKey, cachedPayload);
        }

        sendStarted = true;
        const { data, error } = await apiRequest(`/server/api/dm/${encodeURIComponent(String(dmId))}/messages`, {
            method: 'POST',
            body: { message: messageObject, request_id: createDmRequestId() },
        });

        if (error) throw error;

        if (data?.message?.id != null) {
            if (optimisticEl?.isConnected) optimisticEl.dataset.messageId = String(data.message.id);
            const currentPayload = getScreenDataCache(dmConversationCacheKey);
            const posts = currentPayload?.dm?.[0]?.post;
            const index = Array.isArray(posts) ? posts.findIndex((post) => post.id === messageObject.id) : -1;
            if (index !== -1) {
                posts[index] = data.message;
                setScreenDataCache(dmConversationCacheKey, currentPayload);
            }
        } else {
            deleteScreenDataCache(dmConversationCacheKey);
        }

        // リストキャッシュを破棄
        deleteScreenDataCache(getDmCacheKey('list'));
        return 'sent';
    } catch (e) {
        console.error('DM送信エラー:', e);
        if (optimisticEl) {
            optimisticEl.classList.add('dm-message-send-error');
            optimisticEl.title = sendStarted ? t('dmscreen.send_unconfirmed_title') : t('dmscreen.send_failed_title');
        }
        deleteScreenDataCache(getDmCacheKey('conversation', String(dmId)));
        deleteScreenDataCache(getDmCacheKey('list'));
        if (!sendStarted && uploadedFileIds.length > 0) {
            deleteFilesViaEdgeFunction(uploadedFileIds).catch(() => {});
        }
        if (!sendStarted && input?.isConnected && !getMarkdownEditorValue(input)) {
            setMarkdownEditorValue(input, content);
        }
        const conversation = t('dmscreen.conversation_label', { title: conversationTitle, id: dmId });
        showAppAlert(sendStarted
            ? t('dmscreen.send_unconfirmed_body', { conversation })
            : t('dmscreen.send_failed_body', { conversation, error: e.message || t('post.unknown_error') }));
        return sendStarted ? 'unknown' : 'not-sent';
    } finally {
        if (input) input.disabled = false;
        if (sendButton) sendButton.disabled = false;
        if (input?.isConnected) input.focus();
    }
}

export function openCreateDmModal() {
    DOM.createDmModalContent.innerHTML = `
        <div class="dm-modal-body nui-modal-body">
            <div class="modal-heading">
                <h3 id="create-dm-modal-title" class="nui-modal-title">${t('dmscreen.new_message_title')}</h3>
                <p class="settings-help-text nui-help-text">${t('dmscreen.new_message_help')}</p>
            </div>
            <div class="dm-modal-search-box">
                <input type="text" id="dm-user-search" class="dm-modal-search-input dm-search-input nui-input" placeholder="${t('dmscreen.search_placeholder')}" autofocus>
            </div>
            <div id="dm-user-search-results" class="dm-search-results nui-list" data-nui="list"></div>
        </div>
    `;

    const searchInput = DOM.createDmModalContent.querySelector('#dm-user-search');
    const resultsContainer = DOM.createDmModalContent.querySelector('#dm-user-search-results');

    let searchTimeout;
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            const query = searchInput.value.trim();
            if (query.length < 1) {
                if (resultsContainer) resultsContainer.innerHTML = '';
                return;
            }
            const numericId = /^\d+$/.test(query) ? parseInt(query, 10) : null;
            const orFilter =
                numericId !== null
                    ? `name.ilike.%${query}%,id.eq.${numericId}`
                    : `name.ilike.%${query}%`;
            const { data: users } = await api
                .from('user')
                .select('id, name, scid, icon_data')
                .or(orFilter)
                .neq('id', getCurrentUser().id)
                .limit(8);

            if (resultsContainer) {
                if (users && users.length > 0) {
                    resultsContainer.innerHTML = users
                        .map(
                            (u) => `
                        <div class="dm-search-user-item nui-list-item" data-nui="list-item" data-user-id="${escapeHTML(String(u.id))}">
                            <img ${rankAvatarAttributes(u)} src="${getUserIconUrl(u)}" class="user-icon dm-search-user-icon nui-avatar" alt="">
                            <div class="dm-search-user-info nui-list-copy">
                                <span class="dm-search-user-name nui-list-title">${getEmoji(escapeHTML(u.name))}</span>
                                <span class="dm-search-user-handle nui-list-meta">${getNyaitterId(u)}</span>
                            </div>
                        </div>`,
                        )
                        .join('');
                } else {
                    resultsContainer.innerHTML = `<div class="dm-search-empty nui-empty-text">${t('dmscreen.no_matching_users')}</div>`;
                }
            }
        }, 250);
    });

    resultsContainer?.addEventListener('click', (e) => {
        const userDiv = e.target.closest('[data-user-id]');
        if (userDiv) {
            const targetUserId = parseInt(userDiv.dataset.userId, 10);
            DOM.createDmModal?.classList.add('hidden');
            void handleDmButtonClick(targetUserId);
        }
    });

    DOM.createDmModal?.classList.remove('hidden');
    DOM.createDmModal?.querySelector('.modal-close-btn')?.addEventListener('click', () => {
        DOM.createDmModal.classList.add('hidden');
    });
}

export function renderListHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-action-button">
            <h2 id="page-title">${t('nav.dm')}</h2>
            <button type="button" class="header-action-btn nui-button-secondary" data-nui="button-secondary" data-action="open-create-dm">${t('dm.new_short')}</button>
        </div>`;
}

export function renderConversationShell(content) {
    if (content) content.innerHTML = '<div id="dm-conversation-container"></div>';
}

export function renderListShell(content, activeTab) {
    if (!content) return;
    content.innerHTML = `
        <div class="dm-tabs-container nui-tabs" data-nui="tabs">
            <button type="button" class="dm-tab-button nui-tab ${activeTab === 'inbox' ? 'active is-active' : ''}" data-dm-tab="inbox">
                <span>${t('nav.dm')}</span>
            </button>
            <button type="button" class="dm-tab-button nui-tab ${activeTab === 'requests' ? 'active is-active' : ''}" data-dm-tab="requests">
                <span>${t('dm.tab_requests')}</span>
                <span class="dm-tab-badge hidden" id="dm-request-tab-badge">0</span>
            </button>
        </div>
        <div id="dm-list-container" class="dm-list-container">
            <div id="dm-list-items-wrapper" class="dm-list-items-wrapper nui-list nui-list--flush spinner" data-nui="list" aria-label="${t('common.loading')}"></div>
        </div>`;
}

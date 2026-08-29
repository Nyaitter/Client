import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { api, apiRequest } from '../api.js';
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
    handleDmButtonClick,
    handleUpdateDmTitle,
    handleRemoveDmMember,
    handleSetHostDmMember,
    handleAddDmMember,
    handleLeaveDm,
    handleDisbandDm,
    handleAcceptDmRequest,
    handleDeclineDmRequest,
    sendSystemDmMessage,
} from '../modules/dm.js';
import { filterBlockedPosts, uploadFileViaEdgeFunction, deleteFilesViaEdgeFunction } from '../modules/posts.js';
import { getEmoji } from '../modules/format.js';
import { attachMarkdownContentEditor, getMarkdownEditorValue, setMarkdownEditorValue, setupMarkdownEditorPreviewButton } from '../modules/editor.js';
import { updateNavAndSidebars } from '../modules/sidebar.js';
import { initTabGroup } from '../modules/tabSwipe.js';
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
import { renderConversationShell, renderListHeader, renderListShell } from './dm/view.js';
import { showScreenCompat } from '../screenManager.js';

let activeDmListTab = 'inbox';

function renderDmListItem(dm, unreadCount, currentUserId) {
    const members = Array.isArray(dm.member) ? dm.member : [];
    const otherMemberIds = members.filter((id) => Number(id) !== Number(currentUserId));
    const otherUsers = otherMemberIds.map((id) => getAllUsersCache().get(id)).filter(Boolean);

    let title = dm.title;
    let subtitle = '';
    let avatarHtml = '';

    if (otherUsers.length === 1) {
        const otherUser = otherUsers[0];
        if (!title) title = otherUser.name || `ユーザー #${otherUser.id}`;
        subtitle = getNyaitterId(otherUser);
        avatarHtml = `<img src="${getUserIconUrl(otherUser)}" class="dm-list-item-avatar" alt="">`;
    } else if (otherUsers.length > 1) {
        if (!title) {
            title = otherUsers.map((u) => u.name || `#${u.id}`).join(', ');
        }
        subtitle = `${members.length}人のメンバー`;
        const firstAvatar = otherUsers[0] ? getUserIconUrl(otherUsers[0]) : getUserIconUrl({});
        const secondAvatar = otherUsers[1] ? getUserIconUrl(otherUsers[1]) : getUserIconUrl({});
        avatarHtml = `<div class="dm-group-avatar-stack">
            <img src="${firstAvatar}" class="dm-list-item-avatar dm-group-avatar-1" alt="">
            <img src="${secondAvatar}" class="dm-list-item-avatar dm-group-avatar-2" alt="">
        </div>`;
    } else {
        if (!title) title = '自分のみのメッセージ';
        subtitle = 'プライベートメモ';
        avatarHtml = `<img src="${getUserIconUrl(getCurrentUser())}" class="dm-list-item-avatar" alt="">`;
    }

    if (dm.is_pending) {
        subtitle = subtitle ? `${subtitle} · リクエスト` : 'メッセージリクエスト';
    }

    const dmIdStr = escapeHTML(String(dm.id));
    const titleEscaped = getEmoji(escapeHTML(title || 'メッセージ'));

    return `
        <article class="dm-list-item ${unreadCount > 0 ? 'is-unread' : ''}" data-action="open-dm" data-dm-id="${dmIdStr}">
            <div class="dm-list-item-avatar-wrap">
                ${avatarHtml}
                ${unreadCount > 0 ? `<span class="dm-avatar-unread-badge">${unreadCount}</span>` : ''}
            </div>
            <div class="dm-list-item-main">
                <div class="dm-list-item-header">
                    <span class="dm-list-item-title">${titleEscaped}</span>
                </div>
                ${subtitle ? `<div class="dm-list-item-sub">${escapeHTML(subtitle)}</div>` : ''}
            </div>
            <button type="button" class="dm-manage-btn" title="DM管理メニュー" aria-label="DM管理メニュー" data-action="open-dm-manage" data-dm-id="${dmIdStr}">${ICONS.more}</button>
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

            const inboxDms = dmList.filter((d) => !d.is_pending);
            const requestDms = dmList.filter((d) => Boolean(d.is_pending));

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
                            <div class="dm-empty-state">
                                <p class="settings-help-text">メッセージリクエストはありません。</p>
                            </div>
                        `
                        : `
                            <div class="dm-empty-state">
                                <p class="settings-help-text">まだメッセージはありません。<br>ダイレクトメッセージを送ってみましょう。</p>
                                <button type="button" class="settings-primary-button dm-empty-create-btn" data-action="open-create-dm">新しいメッセージを作成</button>
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

            initTabGroup({
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
                '<p class="error-message">メッセージの読み込みに失敗しました。</p>';
            listItemsWrapper.classList.remove('spinner');
        } finally {
            showLoading(false);
        }
    }
}

export async function showDmConversation(dmId) {
    const container = document.getElementById('dm-conversation-container');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    let dmSelectedFiles = [];

    try {
        const dmConversationCacheKey = getDmCacheKey('conversation', String(dmId));
        let dmPayload = getScreenDataCache(dmConversationCacheKey);
        let error = null;
        const usedCachedPayload = Boolean(dmPayload);
        let cachedUnreadBefore = 0;
        let readSucceeded = !usedCachedPayload;

        if (!dmPayload) {
            const result = await apiRequest(`/server/api/dm/${encodeURIComponent(dmId)}?mark_read=1`);
            dmPayload = result.data || {};
            error = result.error;
            if (!error) setScreenDataCache(dmConversationCacheKey, dmPayload);
        } else {
            const key = String(dmId);
            cachedUnreadBefore = Number(getDmUnreadCounts().get(key) || 0);
            if (cachedUnreadBefore > 0) {
                getDmUnreadCounts().set(key, 0);
                getCurrentUser().unreadDmTotal = Math.max(
                    0,
                    Number(getCurrentUser().unreadDmTotal || 0) - cachedUnreadBefore,
                );
                deleteScreenDataCache(getDmCacheKey('list'));
                void updateNavAndSidebars();
            }
            // /read の完了を待たずにバックグラウンドで非同期送信
            void apiRequest(
                `/server/api/dm/${encodeURIComponent(dmId)}/read`,
                { method: 'POST' },
            ).catch((readErr) => {
                console.warn('DM既読化バックグラウンド送信失敗:', readErr);
            });
        }

        const dm = Array.isArray(dmPayload?.dm) ? dmPayload.dm[0] : null;
        for (const member of dmPayload?.members || []) {
            cacheUser(member);
        }
        const memberList = Array.isArray(dm?.member) ? dm.member.map(Number) : [];
        setActiveDmMemberIds(memberList);
        if (!usedCachedPayload) {
            getCurrentUser().unreadDmTotal = Number(dmPayload?.unread_total || 0);
        }
        if (dm) {
            getDmUnreadCounts().set(String(dm.id), 0);
            deleteScreenDataCache(getDmCacheKey('list'));
            if (!error) void updateNavAndSidebars();
        }
        if (error || !dm || !dm.member.includes(getCurrentUser().id)) {
            DOM.pageHeader.innerHTML = `
                <div class="header-with-back-button">
                    <button class="header-back-btn" data-action="history-back">${ICONS.back}</button>
                    <h2 id="page-title">エラー</h2>
                </div>`;
            container.innerHTML =
                '<p class="error-message" style="margin:2rem;">DMが見つからないか、アクセス権がありません。</p>';
            showLoading(false);
            return;
        }

        // 会話ヘッダーのタイトルとサブタイトル生成
        const otherMemberIds = memberList.filter((id) => id !== Number(getCurrentUser().id));
        const otherUsers = otherMemberIds.map((id) => getAllUsersCache().get(id)).filter(Boolean);
        let headerTitle = dm.title;
        let headerSubtitle = '';
        if (otherUsers.length === 1) {
            if (!headerTitle) headerTitle = otherUsers[0].name || `ユーザー #${otherUsers[0].id}`;
            headerSubtitle = getNyaitterId(otherUsers[0]);
        } else if (otherUsers.length > 1) {
            if (!headerTitle) headerTitle = otherUsers.map((u) => u.name || `#${u.id}`).join(', ');
            headerSubtitle = `${memberList.length}人のメンバー`;
        } else {
            if (!headerTitle) headerTitle = '自分のみのメッセージ';
            headerSubtitle = 'プライベートメモ';
        }

        DOM.pageHeader.innerHTML = `
            <div class="header-with-back-button dm-header-container">
                <button class="header-back-btn" data-action="history-back" aria-label="戻る">${ICONS.back}</button>
                <div class="dm-header-titles">
                    <h2 id="page-title" class="dm-header-title">${getEmoji(escapeHTML(headerTitle))}</h2>
                    <span class="dm-header-subtitle">${escapeHTML(headerSubtitle)}</span>
                </div>
                <button type="button" class="dm-manage-btn" title="DM管理メニュー" aria-label="DM管理メニュー" data-action="open-dm-manage" data-dm-id="${escapeHTML(String(dm.id))}">${ICONS.more}</button>
            </div>
        `;

        setActiveDmId(String(dm.id));
        let posts = dm.post || [];
        posts = filterBlockedPosts(posts);
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

        const DM_CONVERSATION_PAGE_SIZE = 30;
        const initialSlice = posts.slice(Math.max(0, posts.length - DM_CONVERSATION_PAGE_SIZE));
        let loadedCount = initialSlice.length;

        const messagesHTMLArray = await Promise.all(
            initialSlice.slice().reverse().map((msg) => renderDmMessage(msg, dm.id)),
        );
        const messagesHTML = messagesHTMLArray.join('');

        const isPending = Boolean(dm?.is_pending);

        if (isPending) {
            container.innerHTML = `
                <div class="dm-conversation-view">${messagesHTML}</div>
                <div class="dm-request-approval-banner">
                    <div class="dm-request-approval-info">
                        <span class="dm-request-approval-badge">メッセージリクエスト</span>
                        <p class="dm-request-approval-text">${getEmoji(escapeHTML(headerTitle))} さんからのメッセージリクエストです。承認するとメッセージの返信や通知の受信が可能になります。</p>
                    </div>
                    <div class="dm-request-approval-actions">
                        <button type="button" class="dm-request-btn dm-request-decline-btn" id="dm-decline-request-btn">拒否・削除</button>
                        <button type="button" class="dm-request-btn dm-request-accept-btn" id="dm-accept-request-btn">承認する</button>
                    </div>
                </div>
            `;

            void updateNavAndSidebars();
            await flushRealtimeDmMessages(dm.id);
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
                        <div class="file-preview-container dm-file-preview"></div>
                        <div class="markdown-textarea-editor dm-content-editor">
                            <textarea id="dm-message-input" class="markdown-content-editor" rows="1" spellcheck="true" data-markdown-content-editor data-server-input-limit="dm_content_length" placeholder="メッセージを入力 (Ctrl+Enterで送信)"></textarea>
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
                        <button type="button" id="dm-attachment-btn" class="attachment-button dm-action-btn" title="ファイルを添付">${ICONS.attachment}</button>
                        <input type="file" id="dm-file-input" class="hidden" multiple>
                        <button type="button" id="send-dm-btn" class="dm-send-action-btn" title="送信 (Ctrl+Enter)">${ICONS.send}</button>
                    </div>
                </div>
            `;

            void updateNavAndSidebars();
            await flushRealtimeDmMessages(dm.id);
            initializeDmMessageClamps(container);

            const messageInput = document.getElementById('dm-message-input');
            attachMarkdownContentEditor(messageInput);
            setupMarkdownEditorPreviewButton(container, messageInput);
            const fileInput = document.getElementById('dm-file-input');
            const previewContainer = container.querySelector('.file-preview-container');

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
                    removeBtn.parentElement.remove();
                }
            });

            const sendMessageAction = async () => {
                const filesToSend = [...dmSelectedFiles];
                dmSelectedFiles = [];
                if (fileInput) fileInput.value = '';
                if (previewContainer) previewContainer.innerHTML = '';
                await sendDirectMessage(dmId, filesToSend);
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
            // 過去メッセージのページネーションローダー
            if (posts.length > loadedCount) {
                const loadMoreContainer = document.createElement('div');
                loadMoreContainer.className = 'dm-load-more-container';
                const loadMoreBtn = document.createElement('button');
                loadMoreBtn.type = 'button';
                loadMoreBtn.className = 'dm-load-more-btn';
                loadMoreBtn.textContent = '過去のメッセージを読み込む';
                loadMoreContainer.appendChild(loadMoreBtn);
                conversationView.appendChild(loadMoreContainer);

                let isLoadingMoreHistory = false;
                const loadMoreHistory = async () => {
                    if (isLoadingMoreHistory || loadedCount >= posts.length) return;
                    isLoadingMoreHistory = true;
            loadMoreBtn.textContent = '読み込み中';

                    try {
                        const nextSlice = posts.slice(
                            Math.max(0, posts.length - loadedCount - DM_CONVERSATION_PAGE_SIZE),
                            posts.length - loadedCount,
                        );
                        if (nextSlice.length > 0) {
                            const nextHtmlArray = await Promise.all(
                                nextSlice.slice().reverse().map((msg) => renderDmMessage(msg, dm.id)),
                            );
                            loadMoreContainer.insertAdjacentHTML('beforebegin', nextHtmlArray.join(''));
                            loadedCount += nextSlice.length;
                            initializeDmMessageClamps(conversationView);
                        }
                        if (loadedCount >= posts.length) {
                            loadMoreContainer.remove();
                        } else {
                            loadMoreBtn.textContent = '過去のメッセージを読み込む';
                        }
                    } catch (err) {
                        console.error('過去メッセージの読み込みエラー:', err);
                        loadMoreBtn.textContent = '読み込みに失敗しました (再試行)';
                    } finally {
                        isLoadingMoreHistory = false;
                    }
                };

                loadMoreBtn.addEventListener('click', () => void loadMoreHistory());

                const historyObserver = createViewportObserver((entries) => {
                    if (entries[0].isIntersecting) {
                        void loadMoreHistory();
                    }
                });
                historyObserver.observe(loadMoreContainer);
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
        console.error('DM会話の読み込みに失敗:', e);
        container.innerHTML = '<p class="error-message">メッセージの読み込みに失敗しました。</p>';
    } finally {
        showLoading(false);
    }
}

async function sendDirectMessage(dmId, files = []) {
    const input = document.getElementById('dm-message-input');
    const content = getMarkdownEditorValue(input).trim();
    if (!content && files.length === 0) return;
    if (content.length > 2000) {
        showAppAlert('DMの内容は2000文字以下にしてください。');
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
        };

        // 楽観的にDOMへメッセージを追加
        const view = document.querySelector('.dm-conversation-view');
        if (view) {
            const messageHtml = await renderDmMessage(messageObject, dmId);
            view.insertAdjacentHTML('afterbegin', messageHtml);
            initializeDmMessageClamps(view);
            optimisticEl = view.querySelector(`[data-message-id="${messageObject.id}"]`);
        }

        setLastRenderedMessageId(messageObject.id);

        // キャッシュ内のdm会話データにも追加
        const dmConversationCacheKey = getDmCacheKey('conversation', String(dmId));
        const cachedPayload = getScreenDataCache(dmConversationCacheKey);
        if (cachedPayload && Array.isArray(cachedPayload.dm) && cachedPayload.dm[0]) {
            if (!Array.isArray(cachedPayload.dm[0].post)) {
                cachedPayload.dm[0].post = [];
            }
            cachedPayload.dm[0].post.push(messageObject);
            setScreenDataCache(dmConversationCacheKey, cachedPayload);
        }

        const { error } = await api.rpc('append_to_dm_post', {
            dm_id_in: dmId,
            new_message_in: messageObject,
        });

        if (error) throw error;

        // リストキャッシュを破棄（次回一覧表示時に最新メッセージを反映）
        deleteScreenDataCache(getDmCacheKey('list'));
    } catch (e) {
        console.error('DM送信エラー:', e);
        if (optimisticEl) {
            optimisticEl.classList.add('dm-message-send-error');
            optimisticEl.title = '送信に失敗しました';
        }
        if (uploadedFileIds.length > 0) {
            deleteFilesViaEdgeFunction(uploadedFileIds).catch(() => {});
        }
        showAppAlert(`DMの送信に失敗しました: ${e.message || '不明なエラー'}`);
    } finally {
        if (input) input.disabled = false;
        if (sendButton) sendButton.disabled = false;
        if (input) input.focus();
    }
}

export function openCreateDmModal() {
    DOM.createDmModalContent.innerHTML = `
        <div class="dm-modal-body">
            <div class="modal-heading">
                <h3 id="create-dm-modal-title">新しいメッセージ</h3>
                <p class="settings-help-text">ユーザー名またはNyaitterIDで検索してDMを開始します。</p>
            </div>
            <div class="dm-modal-search-box">
                <input type="text" id="dm-user-search" class="dm-modal-search-input dm-search-input" placeholder="ユーザー名またはNyaitterIDで検索" autofocus>
            </div>
            <div id="dm-user-search-results" class="dm-search-results"></div>
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
                        <div class="dm-search-user-item" data-user-id="${escapeHTML(String(u.id))}">
                            <img src="${getUserIconUrl(u)}" class="user-icon dm-search-user-icon" alt="">
                            <div class="dm-search-user-info">
                                <span class="dm-search-user-name">${getEmoji(escapeHTML(u.name))}</span>
                                <span class="dm-search-user-handle">${getNyaitterId(u)}</span>
                            </div>
                        </div>`,
                        )
                        .join('');
                } else {
                    resultsContainer.innerHTML = `<div class="dm-search-empty">一致するユーザーが見つかりません。</div>`;
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

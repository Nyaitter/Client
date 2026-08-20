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
    sendSystemDmMessage,
} from '../modules/dm.js';
import { filterBlockedPosts, uploadFileViaEdgeFunction, deleteFilesViaEdgeFunction } from '../modules/posts.js';
import { getEmoji } from '../modules/format.js';
import { attachMarkdownContentEditor, getMarkdownEditorValue, setMarkdownEditorValue, setupMarkdownEditorPreviewButton } from '../modules/editor.js';
import { updateNavAndSidebars } from '../modules/sidebar.js';
import { sendNotification } from '../modules/notifications.js';
import { escapeHTML, getNyaitterId, showLoading, showAppAlert, showAppConfirm } from '../utils/helpers.js';

export async function showDmScreen(dmId = null, showScreenFn = null) {
    if (!getCurrentUser()) {
        window.location.hash = '#';
        return;
    }
    if (typeof showScreenFn === 'function') {
        showScreenFn('dm-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('dm-screen')?.classList.remove('hidden');
    }

    const contentDiv = DOM.dmContent;

    if (dmId) {
        DOM.pageHeader.innerHTML = '';
        contentDiv.innerHTML = '<div id="dm-conversation-container"></div>';
        await showDmConversation(dmId);
    } else {
        DOM.pageHeader.innerHTML = `<h2 id="page-title">メッセージ</h2>`;
        contentDiv.innerHTML = `
            <div id="dm-list-container">
                <button class="dm-new-message-btn" data-action="open-create-dm">新しいメッセージ</button>
                <div id="dm-list-items-wrapper" class="spinner"></div>
            </div>
        `;
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

            if (window.location.hash.startsWith('#dm/')) {
                window.history.replaceState({ path: '#dm' }, '', '#dm');
            }

            if (dmList.length === 0) {
                listItemsWrapper.innerHTML =
                    '<p style="text-align:center; padding: 2rem; color: var(--secondary-text-color);">まだメッセージはありません。</p>';
            } else {
                listItemsWrapper.innerHTML = dmList
                    .map((dm) => {
                        const unreadCount = unreadCountsMap.get(String(dm.id)) || 0;
                        const titlePrefix = unreadCount > 0 ? `(${unreadCount}) ` : '';
                        const title = getEmoji(
                            escapeHTML(
                                dm.title ||
                                    (dm.member || [])
                                        .map((id) => getAllUsersCache().get(id)?.name || id)
                                        .join(', '),
                            ),
                        );

                        return `
                            <div class="dm-list-item" data-action="open-dm" data-dm-id="${escapeHTML(String(dm.id))}">
                                <div class="dm-list-item-title"><span class="dm-list-item-unread-prefix">${titlePrefix}</span>${title}</div>
                                <button type="button" class="dm-manage-btn" title="DM管理メニュー" aria-label="DM管理メニュー" data-action="open-dm-manage" data-dm-id="${escapeHTML(String(dm.id))}">${ICONS.more}</button>
                            </div>
                        `;
                    })
                    .join('');
            }
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
            const { error: readError } = await apiRequest(
                `/server/api/dm/${encodeURIComponent(dmId)}/read`,
                { method: 'POST' },
            );
            if (readError) {
                console.error('DM既読化に失敗しました:', readError);
            } else {
                readSucceeded = true;
                getDmUnreadCounts().set(key, 0);
                getCurrentUser().unreadDmTotal = Math.max(
                    0,
                    Number(getCurrentUser().unreadDmTotal || 0) - cachedUnreadBefore,
                );
                deleteScreenDataCache(getDmCacheKey('list'));
            }
        }

        const dm = Array.isArray(dmPayload?.dm) ? dmPayload.dm[0] : null;
        for (const member of dmPayload?.members || []) {
            cacheUser(member);
        }
        setActiveDmMemberIds(Array.isArray(dm?.member) ? dm.member.map(Number) : []);
        if (!usedCachedPayload) {
            getCurrentUser().unreadDmTotal = Number(dmPayload?.unread_total || 0);
        }
        if (dm && readSucceeded) {
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

        DOM.pageHeader.innerHTML = `
            <div class="header-with-back-button">
                <button class="header-back-btn" data-action="history-back">${ICONS.back}</button>
                <div style="flex-grow:1;">
                    <h2 id="page-title" style="font-size: 1.1rem; margin-bottom: 0;">${getEmoji(escapeHTML(dm.title || 'メッセージ'))}</h2>
                    <small style="color: var(--secondary-text-color);">${dm.member.length}人のメンバー</small>
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

        const messagesHTMLArray = await Promise.all(
            posts.slice().reverse().map((msg) => renderDmMessage(msg, dm.id)),
        );
        const messagesHTML = messagesHTMLArray.join('');

        container.innerHTML = `
            <div class="dm-conversation-view">${messagesHTML}</div>
            <div class="dm-message-form">
                <div class="dm-form-content">
                    <div class="markdown-textarea-editor dm-content-editor"><textarea id="dm-message-input" class="markdown-content-editor" rows="2" spellcheck="true" data-markdown-content-editor data-server-input-limit="dm_content_length" placeholder="メッセージを送信"></textarea><div class="markdown-editor-paint" aria-hidden="true"><div class="markdown-editor-placeholder"></div><div class="markdown-editor-preview hidden"></div><div class="markdown-editor-selection"></div><div class="markdown-editor-composition"></div><div class="markdown-editor-caret"></div></div></div>
                    <div class="file-preview-container dm-file-preview"></div>
                </div>
                <div class="dm-form-actions">
                    <button id="dm-attachment-btn" class="attachment-button" title="ファイルを添付">${ICONS.attachment}</button>
                    <input type="file" id="dm-file-input" class="hidden" multiple>
                    <button id="send-dm-btn" title="送信 (Ctrl+Enter)">${ICONS.send}</button>
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

        fileInput?.addEventListener('change', (event) => {
            dmSelectedFiles = Array.from(event.target.files);
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
                        previewItem.innerHTML = `<div style="display:flex; align-items:center; gap:0.5rem;"><audio src="${e.target.result}" controls style="height: 30px; width: 200px;"></audio><button class="file-preview-remove" data-index="${index}" style="position:relative; top:0; right:0;">×</button></div>`;
                    };
                    reader.readAsDataURL(file);
                } else {
                    previewItem.innerHTML = `<span>📄 ${escapeHTML(file.name)}</span><button class="file-preview-remove" data-index="${index}">×</button>`;
                }
                previewContainer.appendChild(previewItem);
            });
        });

        previewContainer?.addEventListener('click', (e) => {
            if (e.target.classList.contains('file-preview-remove')) {
                const indexToRemove = parseInt(e.target.dataset.index, 10);
                dmSelectedFiles.splice(indexToRemove, 1);
                const newFiles = new DataTransfer();
                dmSelectedFiles.forEach((file) => newFiles.items.add(file));
                if (fileInput) {
                    fileInput.files = newFiles.files;
                    fileInput.dispatchEvent(new Event('change'));
                }
            }
        });

        const sendMessageAction = async () => {
            const text = getMarkdownEditorValue(messageInput).trim();
            if (!text && dmSelectedFiles.length === 0) return;
            await sendDirectMessage(dmId, dmSelectedFiles);
            dmSelectedFiles = [];
            if (fileInput) fileInput.value = '';
            if (previewContainer) previewContainer.innerHTML = '';
        };

        messageInput?.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                void sendMessageAction();
            }
        });
        document.getElementById('send-dm-btn')?.addEventListener('click', () => {
            void sendMessageAction();
        });

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

    try {
        let uploadedFileIds = [];
        let attachmentsData = [];

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
            type: 'message',
            userid: getCurrentUser().id,
            message: content,
            attachments: attachmentsData,
            created_at: new Date().toISOString(),
        };

        const { error } = await api.rpc('append_to_dm_post', {
            dm_id_in: dmId,
            new_message_in: messageObject,
        });

        if (error) throw error;

        invalidateDmCaches(dmId);
        setMarkdownEditorValue(input, '');
        await showDmConversation(dmId);
    } catch (e) {
        console.error('DM送信エラー:', e);
        showAppAlert(`DMの送信に失敗しました: ${e.message || '不明なエラー'}`);
    } finally {
        if (input) input.disabled = false;
        if (sendButton) sendButton.disabled = false;
    }
}

export function openCreateDmModal() {
    DOM.createDmModalContent.innerHTML = `
        <div style="padding: 1.5rem;">
            <h3>新しいメッセージ</h3>
            <p>ユーザーを検索してDMを開始します。</p>
            <input type="text" id="dm-user-search" placeholder="ユーザー名またはIDで検索" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: 8px;">
            <div id="dm-user-search-results" style="margin-top: 1rem; max-height: 200px; overflow-y: auto;"></div>
        </div>
    `;

    const searchInput = DOM.createDmModalContent.querySelector('#dm-user-search');
    const resultsContainer = DOM.createDmModalContent.querySelector('#dm-user-search-results');

    let searchTimeout;
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            const query = searchInput.value.trim();
            if (query.length < 2) {
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
                .select('id, name, scid')
                .or(orFilter)
                .neq('id', getCurrentUser().id)
                .limit(5);

            if (resultsContainer) {
                if (users && users.length > 0) {
                    resultsContainer.innerHTML = users
                        .map(
                            (u) => `
                        <div class="widget-item" style="cursor: pointer;" data-user-id="${escapeHTML(String(u.id))}">
                            <strong>${getEmoji(escapeHTML(u.name))}</strong> (${getNyaitterId(u)})
                        </div>`,
                        )
                        .join('');
                } else {
                    resultsContainer.innerHTML = `<div class="widget-item">ユーザーが見つかりません。</div>`;
                }
            }
        }, 300);
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

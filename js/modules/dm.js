import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { api, apiRequest } from '../api.js';
import {
    getCurrentUser,
    getAllUsersCache,
    getActiveDmId,
    setActiveDmId,
    getLastRenderedMessageId,
    setLastRenderedMessageId,
    getPendingRealtimeDmMessages,
    getActiveDmMemberIds,
    setActiveDmMemberIds,
} from '../state.js';
import {
    dmE2EDecryptMessage,
    dmE2EEncryptContent,
} from './dmCrypto.js';
import {
    ensureMentionedUsersCached,
    uploadFileViaEdgeFunction,
} from './posts.js';
import {
    getEmoji,
    emoji_picker_create,
} from './format.js';
import { renderNyarkDown } from './nyarkdown.js';
import {
    attachMarkdownContentEditor,
    getMarkdownEditorValue,
    setMarkdownEditorValue,
    setupMarkdownEditorPreviewButton,
} from './editor.js';
import {
    cacheUser,
    getCachedUser,
    cacheUsers,
    invalidateDmCaches,
} from './cache.js';
import {
    escapeHTML,
    getUserIconUrl,
    getSafeHttpUrl,
    getAttachmentImagePreviewUrl,
    formatPostTimestamp,
    showAppAlert,
    showAppConfirm,
    showAppPrompt,
    showLoading,
} from '../utils/helpers.js';
import { isDataSaverEnabled } from './theme.js';

export async function renderDmMessage(msg, dmId = null) {
    const currentUserId = getCurrentUser()?.id;
    const plaintext = await dmE2EDecryptMessage(msg, currentUserId) || msg.message || '';
    await ensureMentionedUsersCached([plaintext]);

    if (msg.type === 'system') {
        const formattedContent = renderNyarkDown(
            plaintext,
            getAllUsersCache(),
            { allowMarkdown: true },
        );
        return `<div class="dm-system-message">${formattedContent}</div>`;
    }

    let attachmentsHTML = '';
    if (msg.attachments && msg.attachments.length > 0) {
        attachmentsHTML += '<div class="attachments-container">';
        for (const attachment of msg.attachments) {
            const { data: publicUrlData } = api.storage
                .from('nyaitter')
                .getPublicUrl(attachment.id);
            const safeAttachmentUrl = getSafeHttpUrl(publicUrlData?.publicUrl);
            if (!safeAttachmentUrl) continue;
            const publicURL = escapeHTML(safeAttachmentUrl);
            const previewURL = escapeHTML(
                getAttachmentImagePreviewUrl(safeAttachmentUrl),
            );
            const attachmentName = escapeHTML(
                String(attachment.name || '添付ファイル').slice(0, 255),
            );

            let itemHTML = '<div class="attachment-item">';
            if (attachment.type === 'image') {
                itemHTML += `<img src="${previewURL}" alt="${attachmentName}" class="attachment-image" loading="lazy" decoding="async" data-action="open-image" data-url="${publicURL}">`;
            } else if (attachment.type === 'video') {
                itemHTML += `<video src="${publicURL}" controls preload="${isDataSaverEnabled() ? 'metadata' : 'auto'}"></video>`;
            } else if (attachment.type === 'audio') {
                itemHTML += `<audio src="${publicURL}" controls></audio>`;
            }

            itemHTML += `<a href="${publicURL}" class="attachment-download-link" data-action="download-attachment" data-url="${publicURL}" data-name="${attachmentName}">${getEmoji('📄')} ${attachmentName}</a>`;
            itemHTML += '</div>';
            attachmentsHTML += itemHTML;
        }
        attachmentsHTML += '</div>';
    }

    const formattedContent = plaintext
        ? renderNyarkDown(plaintext, getAllUsersCache(), { allowMarkdown: true })
        : '';
    const sent = Number(msg.userid) === Number(currentUserId);

    if (sent) {
        return `<div class="dm-message-container sent" data-message-id="${escapeHTML(msg.id)}">
            <div class="dm-message-wrapper">
                <button type="button" class="dm-message-menu-btn" title="メッセージメニュー" aria-label="メッセージメニュー">${ICONS.more}</button>
                <div class="post-menu">
                    <button class="edit-dm-msg-btn">編集</button>
                    <button class="delete-dm-msg-btn delete-btn">削除</button>
                </div>
                <div class="dm-message"><div class="dm-message-content">${formattedContent}</div>${attachmentsHTML}</div>
            </div>
        </div>`;
    } else {
        const user = getAllUsersCache().get(msg.userid) || {};
        const time = formatPostTimestamp(msg);
        return `<div class="dm-message-container received" data-message-id="${escapeHTML(msg.id)}">
            <a href="#profile/${user.id}" class="dm-user-link">
                <img src="${getUserIconUrl(user)}" class="dm-message-icon" alt="">
            </a>
            <div class="dm-message-wrapper">
                <div class="post-menu">
                    <button class="report-dm-message-btn" data-dm-id="${escapeHTML(String(dmId || ''))}" data-message-id="${escapeHTML(String(msg.id || ''))}">報告する</button>
                </div>
                <div class="dm-message-meta">
                    <a href="#profile/${user.id}" class="dm-user-link">${getEmoji(escapeHTML(user.name || '不明'))}</a>
                    <span class="dm-message-time">・${time}</span>
                    <button type="button" class="dm-message-menu-btn" title="メッセージメニュー" aria-label="メッセージメニュー">${ICONS.more}</button>
                </div>
                <div class="dm-message"><div class="dm-message-content">${formattedContent}</div>${attachmentsHTML}</div>
            </div>
        </div>`;
    }
}

export function attachDmMessageClamp(messageEl) {
    if (!(messageEl instanceof HTMLElement)) return;
    if (messageEl.dataset.clampInitialized === 'true') return;
    const contentEl = messageEl.querySelector('.dm-message-content');
    if (!contentEl) return;
    messageEl.dataset.clampInitialized = 'true';
    messageEl.dataset.clampContent = '1';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'dm-clamp-toggle';
    toggleBtn.textContent = '続きを表示';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.addEventListener('click', () => {
        const expanded = contentEl.classList.toggle('dm-message-content-expanded');
        toggleBtn.textContent = expanded ? '閉じる' : '続きを表示';
        toggleBtn.setAttribute('aria-expanded', String(expanded));
        toggleBtn.classList.toggle('expanded', expanded);
    });
    contentEl.after(toggleBtn);

    const measure = () => {
        if (!messageEl.isConnected || !contentEl.isConnected) return null;
        const wasExpanded = contentEl.classList.contains('dm-message-content-expanded');
        if (!wasExpanded) contentEl.classList.add('dm-message-content-expanded');
        const naturalHeight = contentEl.getBoundingClientRect().height;
        if (!wasExpanded) contentEl.classList.remove('dm-message-content-expanded');
        const clampLimit = Number.parseFloat(window.getComputedStyle(contentEl).maxHeight);
        if (Number.isFinite(clampLimit) && naturalHeight > clampLimit + 1) {
            toggleBtn.classList.add('is-visible');
        }
        return true;
    };
    let attempts = 0;
    const timer = setInterval(() => {
        if (measure() === true || ++attempts >= 20) clearInterval(timer);
    }, 50);
}

export function initializeDmMessageClamps(root = document) {
    root.querySelectorAll('.dm-message').forEach(attachDmMessageClamp);
}

export function positionDmMessageMenu(menu, menuButton) {
    const edgeMargin = 8;
    const gap = 6;
    const buttonRect = menuButton.getBoundingClientRect();
    const opensRightPreferred = menuButton
        .closest('.dm-message-container')
        ?.classList.contains('received');

    menu.classList.add('dm-message-menu-popover');
    menu.style.maxWidth = `${Math.max(0, window.innerWidth - edgeMargin * 2)}px`;

    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    let opensRight = Boolean(opensRightPreferred);
    let left = opensRight
        ? buttonRect.right + gap
        : buttonRect.left - menuWidth - gap;

    if (left + menuWidth > window.innerWidth - edgeMargin) {
        opensRight = false;
        left = buttonRect.left - menuWidth - gap;
    }
    if (left < edgeMargin) {
        opensRight = true;
        left = buttonRect.right + gap;
    }
    left = Math.max(edgeMargin, Math.min(left, window.innerWidth - menuWidth - edgeMargin));

    let top = buttonRect.top;
    if (top + menuHeight > window.innerHeight - edgeMargin) {
        top = buttonRect.bottom - menuHeight;
    }
    top = Math.max(edgeMargin, Math.min(top, window.innerHeight - menuHeight - edgeMargin));

    menu.classList.toggle('dm-message-menu-opens-right', opensRight);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.right = 'auto';
    menu.style.bottom = 'auto';
}

export function isActiveDmConversation(dmId) {
    return (
        String(getActiveDmId() || '') === String(dmId || '') &&
        window.location.hash === `#dm/${encodeURIComponent(String(dmId))}`
    );
}

export function hasRenderedDmMessage(view, messageId) {
    return [...view.querySelectorAll('[data-message-id]')].some(
        (element) => String(element.dataset.messageId) === String(messageId),
    );
}

export function queueRealtimeDmMessage(dmId, message, sender) {
    const key = String(dmId);
    const pending = getPendingRealtimeDmMessages().get(key) || [];
    if (!pending.some((entry) => String(entry.message.id) === String(message.id))) {
        pending.push({ message, sender });
    }
    getPendingRealtimeDmMessages().set(key, pending);
}

export async function markOpenDmMessageRead(dmId, message) {
    if (Number(message.userid) === Number(getCurrentUser()?.id)) return;
    const { error } = await apiRequest(
        `/server/api/dm/${encodeURIComponent(String(dmId))}/read`,
        { method: 'POST' },
    );
    if (error) console.error('リアルタイムDMの既読化に失敗しました:', error);
}

export async function appendRealtimeDmMessage(dmId, message, sender = null) {
    if (!message || typeof message !== 'object' || !message.id || !isActiveDmConversation(dmId)) {
        return;
    }
    if (sender && Number.isInteger(Number(sender.id))) cacheUser(sender);

    const view = document.querySelector('.dm-conversation-view');
    if (!view) {
        queueRealtimeDmMessage(dmId, message, sender);
        return;
    }
    if (hasRenderedDmMessage(view, message.id)) return;
    if (getCurrentUser()?.block?.includes(Number(message.userid))) {
        await markOpenDmMessageRead(dmId, message);
        return;
    }

    const messageHtml = await renderDmMessage(message, dmId);
    if (!isActiveDmConversation(dmId) || hasRenderedDmMessage(view, message.id)) return;
    view.insertAdjacentHTML('afterbegin', messageHtml);
    initializeDmMessageClamps(view);
    setLastRenderedMessageId(message.id);
    await markOpenDmMessageRead(dmId, message);
}

export async function flushRealtimeDmMessages(dmId) {
    const key = String(dmId);
    const pending = getPendingRealtimeDmMessages().get(key) || [];
    getPendingRealtimeDmMessages().delete(key);
    for (const { message, sender } of pending) {
        await appendRealtimeDmMessage(key, message, sender);
    }
}

export async function handleDmButtonClick(targetUserId, onOpenConversation = null) {
    if (!getCurrentUser()) return showAppAlert('ログインが必要です。');
    showLoading(true);

    try {
        const normalizedTargetUserId = Number(targetUserId);
        if (!Number.isInteger(normalizedTargetUserId) || normalizedTargetUserId < 0) {
            throw new Error('DMの相手を確認できませんでした');
        }

        const { data, error } = await apiRequest('/server/api/dm', {
            method: 'POST',
            body: { member: [normalizedTargetUserId] },
        });
        const dmId = data?.dm?.id || data?.id || null;

        if (error || !dmId) throw new Error(error?.message || 'DMの開始に失敗しました');

        if (typeof onOpenConversation === 'function') {
            onOpenConversation(dmId);
        } else {
            window.location.hash = `#dm/${encodeURIComponent(String(dmId))}`;
        }
    } catch (e) {
        console.error('DM開始エラー:', e);
        showAppAlert(e.message || 'DMを開始できませんでした。');
    } finally {
        showLoading(false);
    }
}

export async function sendSystemDmMessage(dmId, content) {
    try {
        const messageObject = {
            id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: 'system',
            message: content,
            created_at: new Date().toISOString(),
        };
        await api.rpc('append_to_dm_post', {
            dm_id_in: dmId,
            new_message_in: messageObject,
        });
    } catch (e) {
        console.error('システムメッセージ送信エラー:', e);
    }
}

export async function sendDmMessage(dmId, messageText, attachments = [], onComplete = null) {
    if (!getCurrentUser()) return showAppAlert('ログインが必要です。');
    const text = messageText.trim();
    if (!text && attachments.length === 0) return;

    showLoading(true);
    let uploadedFileIds = [];
    let attachmentsData = [];

    try {
        for (const file of attachments) {
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
            message: text,
            attachments: attachmentsData,
            created_at: new Date().toISOString(),
        };

        const { error } = await api.rpc('append_to_dm_post', {
            dm_id_in: dmId,
            new_message_in: messageObject,
        });

        if (error) throw error;

        invalidateDmCaches(dmId);
        if (typeof onComplete === 'function') {
            await onComplete();
        }
    } catch (e) {
        console.error('DM送信エラー:', e);
        if (uploadedFileIds.length > 0) {
            await apiRequest('/server/api/uploads', {
                method: 'DELETE',
                body: { fileIds: uploadedFileIds },
            }).catch(() => {});
        }
        showAppAlert(`DMの送信に失敗しました: ${e.message || '不明なエラー'}`);
    } finally {
        showLoading(false);
    }
}

export async function handleUpdateDmTitle(dmId, newTitle, onComplete = null) {
    const title = (newTitle || '').trim();
    if (!title) return;
    try {
        const { error } = await api.from('dm').update({ title }).eq('id', dmId);
        if (error) throw error;
        await sendSystemDmMessage(dmId, `グループ名が「${escapeHTML(title)}」に変更されました`);
        invalidateDmCaches(dmId);
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert('タイトルの更新に失敗しました');
    }
}

export async function handleRemoveDmMember(dmId, memberId, onComplete = null) {
    try {
        const { data: dm } = await api.from('dm').eq('id', dmId).single();
        if (!dm) return;
        const newMembers = (dm.users || []).filter((id) => Number(id) !== Number(memberId));
        const { error } = await api.from('dm').update({ users: newMembers }).eq('id', dmId);
        if (error) throw error;

        const removedUser = getCachedUser(memberId);
        const name = removedUser?.name || `user${memberId}`;
        await sendSystemDmMessage(dmId, `${escapeHTML(name)} さんがグループから退出させられました`);
        invalidateDmCaches(dmId);
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert('メンバーの削除に失敗しました');
    }
}

export async function handleSetHostDmMember(dmId, memberId, onComplete = null) {
    try {
        const { error } = await api.from('dm').update({ host: memberId }).eq('id', dmId);
        if (error) throw error;
        const newHost = getCachedUser(memberId);
        const name = newHost?.name || `user${memberId}`;
        await sendSystemDmMessage(dmId, `${escapeHTML(name)} さんが新しいホストになりました`);
        invalidateDmCaches(dmId);
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert('ホストの変更に失敗しました');
    }
}

export async function handleAddDmMember(dmId, newMemberId, onComplete = null) {
    try {
        const { data: dm } = await api.from('dm').eq('id', dmId).single();
        if (!dm) return;
        const newMembers = Array.from(new Set([...(dm.users || []), Number(newMemberId)]));
        const { error } = await api.from('dm').update({ users: newMembers }).eq('id', dmId);
        if (error) throw error;

        const addedUser = getCachedUser(newMemberId);
        const name = addedUser?.name || `user${newMemberId}`;
        await sendSystemDmMessage(dmId, `${escapeHTML(name)} さんがグループに追加されました`);
        invalidateDmCaches(dmId);
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert('メンバーの追加に失敗しました');
    }
}

export async function handleLeaveDm(dmId, onComplete = null) {
    const confirm = await showAppConfirm('このDMグループから退出しますか？');
    if (!confirm) return;
    try {
        const { data: dm } = await api.from('dm').eq('id', dmId).single();
        if (!dm) return;
        const myId = getCurrentUser()?.id;
        const newMembers = (dm.users || []).filter((id) => Number(id) !== Number(myId));
        const { error } = await api.from('dm').update({ users: newMembers }).eq('id', dmId);
        if (error) throw error;

        const name = getCurrentUser()?.name || `user${myId}`;
        await sendSystemDmMessage(dmId, `${escapeHTML(name)} さんがグループから退出しました`);
        invalidateDmCaches(dmId);
        window.location.hash = '#dm';
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert('グループからの退出に失敗しました');
    }
}

export async function handleDisbandDm(dmId, onComplete = null) {
    const confirm = await showAppConfirm('このDMグループを解散して削除しますか？この操作は取り消せません。');
    if (!confirm) return;
    try {
        const { error } = await api.from('dm').delete().eq('id', dmId);
        if (error) throw error;
        invalidateDmCaches(dmId);
        window.location.hash = '#dm';
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert('グループの解散に失敗しました');
    }
}

export async function openDmManageModal(dmId, onComplete = null) {
    const modal = DOM.dmManageModal;
    const content = DOM.dmManageModalContent;
    if (!modal || !content) return;
    showLoading(true);

    try {
        const { data: dm, error } = await api.from('dm').eq('id', dmId).single();
        if (error || !dm) throw new Error('DM情報の取得に失敗しました');

        const currentUserId = getCurrentUser()?.id;
        const isHost = Number(dm.host) === Number(currentUserId);
        const memberIds = dm.users || [];

        const { data: members } = await api.from('user').in('id', memberIds);
        if (members) cacheUsers(members);

        content.innerHTML = `
            <div class="dm-manage-container">
                <h3>DM管理</h3>
                <div class="dm-manage-field">
                    <label for="dm-manage-title-input">グループ名</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input id="dm-manage-title-input" type="text" value="${escapeHTML(dm.title || '')}" ${!isHost ? 'disabled' : ''}>
                        ${isHost ? '<button type="button" id="dm-manage-title-save-btn" class="settings-primary-button">変更</button>' : ''}
                    </div>
                </div>
                <div class="dm-manage-members">
                    <h4>参加メンバー (${memberIds.length})</h4>
                    <div class="dm-manage-member-list"></div>
                </div>
                ${isHost ? `
                <div class="dm-manage-add-member" style="margin-top: 1rem;">
                    <label for="dm-manage-add-input">メンバーを追加 (ユーザーID)</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input id="dm-manage-add-input" type="number" placeholder="ユーザーID">
                        <button type="button" id="dm-manage-add-btn" class="settings-primary-button">追加</button>
                    </div>
                </div>` : ''}
                <div class="dm-manage-actions" style="margin-top: 1.5rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
                    <button type="button" id="dm-manage-leave-btn" class="settings-danger-button">グループから退出</button>
                    ${isHost ? '<button type="button" id="dm-manage-disband-btn" class="settings-danger-button">グループを解散</button>' : ''}
                </div>
            </div>
        `;

        const listEl = content.querySelector('.dm-manage-member-list');
        memberIds.forEach((uid) => {
            const user = getCachedUser(uid) || { id: uid, name: `user${uid}` };
            const isUserHost = Number(dm.host) === Number(uid);
            const isMe = Number(uid) === Number(currentUserId);
            const item = document.createElement('div');
            item.className = 'dm-manage-member-item';
            item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border-color);';
            item.innerHTML = `
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <img src="${getUserIconUrl(user)}" class="user-icon" style="width:32px;height:32px;border-radius:50%;" alt="">
                    <span>${getEmoji(escapeHTML(user.name))}</span>
                    ${isUserHost ? '<span class="admin-badge" style="font-size:0.75em;background:var(--primary-color);color:#fff;padding:2px 6px;border-radius:4px;">ホスト</span>' : ''}
                </div>
                <div style="display:flex;gap:0.25rem;">
                    ${isHost && !isMe ? `
                        <button type="button" class="set-host-btn login-secondary-button" data-uid="${uid}" style="font-size:0.8em;padding:2px 8px;">ホストにする</button>
                        <button type="button" class="remove-member-btn settings-danger-button" data-uid="${uid}" style="font-size:0.8em;padding:2px 8px;">削除</button>
                    ` : ''}
                </div>
            `;
            listEl.appendChild(item);
        });

        content.querySelector('#dm-manage-title-save-btn')?.addEventListener('click', () => {
            const title = content.querySelector('#dm-manage-title-input')?.value;
            void handleUpdateDmTitle(dmId, title, onComplete);
        });

        content.querySelector('#dm-manage-add-btn')?.addEventListener('click', () => {
            const uid = content.querySelector('#dm-manage-add-input')?.value;
            if (uid) void handleAddDmMember(dmId, uid, onComplete);
        });

        content.querySelectorAll('.set-host-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                void handleSetHostDmMember(dmId, btn.dataset.uid, onComplete);
            });
        });

        content.querySelectorAll('.remove-member-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                void handleRemoveDmMember(dmId, btn.dataset.uid, onComplete);
            });
        });

        content.querySelector('#dm-manage-leave-btn')?.addEventListener('click', () => {
            modal.classList.add('hidden');
            void handleLeaveDm(dmId, onComplete);
        });

        content.querySelector('#dm-manage-disband-btn')?.addEventListener('click', () => {
            modal.classList.add('hidden');
            void handleDisbandDm(dmId, onComplete);
        });

        content.querySelector('.modal-close-btn')?.addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        modal.classList.remove('hidden');
    } catch (e) {
        showAppAlert(e.message || 'DM管理モーダルの表示に失敗しました');
    } finally {
        showLoading(false);
    }
}

export async function openDmEditModal(dmId, messageId, onComplete = null) {
    const modal = DOM.editDmMessageModal;
    const content = DOM.editDmMessageModalContent;
    if (!modal || !content) return;
    showLoading(true);

    try {
        const { data: dm, error } = await api.from('dm').eq('id', dmId).single();
        if (error || !dm) throw new Error('DMメッセージの取得に失敗しました');

        const message = (dm.messages || []).find((m) => String(m.id) === String(messageId));
        if (!message) throw new Error('メッセージが見つかりませんでした');

        content.innerHTML = `
            <div class="post-form" style="padding: 1rem;">
                <h3>メッセージを編集</h3>
                <button class="modal-close-btn">×</button>
                <div class="form-content">
                    <div class="markdown-textarea-editor post-form-textarea">
                        <textarea id="edit-dm-textarea" class="markdown-content-editor" rows="4">${escapeHTML(message.message || '')}</textarea>
                        <div class="markdown-editor-paint" aria-hidden="true"><div class="markdown-editor-placeholder"></div><div class="markdown-editor-preview hidden"></div><div class="markdown-editor-selection"></div><div class="markdown-editor-composition"></div><div class="markdown-editor-caret"></div></div>
                    </div>
                    <div class="post-form-actions" style="margin-top: 1rem;">
                        <button type="button" class="emoji-pic-button float-left" title="絵文字を選択">${ICONS.emoji}</button>
                        <div id="emoji-picker" class="hidden"></div>
                        <button id="update-dm-btn" class="settings-primary-button float-right">更新</button>
                        <span class="float-clear"></span>
                    </div>
                </div>
            </div>
        `;

        await emoji_picker_create({ triggerButton: content.querySelector('.emoji-pic-button') });
        const editDmEditor = content.querySelector('#edit-dm-textarea');
        attachMarkdownContentEditor(editDmEditor);
        setupMarkdownEditorPreviewButton(content, editDmEditor);

        content.querySelector('#update-dm-btn')?.addEventListener('click', async () => {
            const updatedText = getMarkdownEditorValue(content.querySelector('#edit-dm-textarea')).trim();
            if (!updatedText) return showAppAlert('メッセージを入力してください');
            modal.classList.add('hidden');
            await handleUpdateDmMessage(dmId, messageId, updatedText, onComplete);
        });

        content.querySelector('.modal-close-btn')?.addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        modal.classList.remove('hidden');
    } catch (e) {
        showAppAlert(e.message || '編集モーダルの読み込みに失敗しました');
    } finally {
        showLoading(false);
    }
}

export async function handleUpdateDmMessage(dmId, messageId, newText, onComplete = null) {
    showLoading(true);
    try {
        const { data: dm } = await api.from('dm').eq('id', dmId).single();
        if (!dm) return;
        const messages = (dm.messages || []).map((m) => {
            if (String(m.id) === String(messageId)) {
                return { ...m, message: newText, edited: true };
            }
            return m;
        });

        const { error } = await api.from('dm').update({ messages }).eq('id', dmId);
        if (error) throw error;

        invalidateDmCaches(dmId);
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert('メッセージの更新に失敗しました');
    } finally {
        showLoading(false);
    }
}

export async function handleDeleteDmMessage(dmId, messageId, onComplete = null) {
    const confirm = await showAppConfirm('このメッセージを削除しますか？');
    if (!confirm) return;
    showLoading(true);

    try {
        const { data: dm } = await api.from('dm').eq('id', dmId).single();
        if (!dm) return;
        const messages = (dm.messages || []).filter((m) => String(m.id) !== String(messageId));

        const { error } = await api.from('dm').update({ messages }).eq('id', dmId);
        if (error) throw error;

        invalidateDmCaches(dmId);
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert('メッセージの削除に失敗しました');
    } finally {
        showLoading(false);
    }
}

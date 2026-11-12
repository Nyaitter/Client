import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { api, apiRequest } from '../api.js';
import { router } from '../router.js';
import { rankAvatarAttributes } from './rankAvatarIntegration.js';
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
    insertMarkdownEditorText,
    setupMarkdownEditorPreviewButton,
} from './editor.js';
import {
    cacheUser,
    getCachedUser,
    cacheUsers,
    invalidateDmCaches,
    getScreenDataCache,
    getDmCacheKey,
} from './cache.js';
import {
    escapeHTML,
    getNyaitterId,
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

export function createDmRequestId() {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

export async function renderDmMessage(msg, dmId = null, visibleMessages = []) {
    const currentUserId = getCurrentUser()?.id;
    const plaintext = await dmE2EDecryptMessage(msg, currentUserId) || msg.content || msg.message || '';
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
    const time = formatPostTimestamp(msg);
    const target = msg.reply_to && visibleMessages.find((item) => String(item.id) === String(msg.reply_to));
    const canDescribeTarget = target && target.type === 'user' && !target.e2e && !target.deleted && !target.deleted_at
        && !getCurrentUser()?.block?.includes(Number(target.userid));
    const targetName = canDescribeTarget ? (getAllUsersCache().get(target.userid)?.name || '不明') : '';
    const targetContent = canDescribeTarget ? String(target.content || target.message || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const replyInner = canDescribeTarget
        ? `<span class="dm-reply-reference-icon" aria-hidden="true">${ICONS.reply}</span><span class="dm-reply-reference-name">${escapeHTML(targetName)}</span><span class="dm-reply-reference-text">${escapeHTML(targetContent || 'メッセージ')}</span>`
        : `<span class="dm-reply-reference-icon" aria-hidden="true">${ICONS.reply}</span><span class="dm-reply-reference-text">メッセージへの返信</span>`;
    const replyHtml = msg.reply_to
        ? `<button type="button" class="dm-reply-reference" data-reply-target-id="${escapeHTML(String(msg.reply_to))}" title="返信先のメッセージへ移動">${replyInner}</button>`
        : '';

    if (sent) {
        const readCount = Number(msg.read_count || 0);
        const readStatusHtml = readCount > 0
            ? `<span class="dm-message-read-status">既読${readCount > 1 ? ` ${readCount}` : ''}</span>`
            : '';

        return `<div class="dm-message-container sent" data-message-id="${escapeHTML(msg.id)}">
            <div class="dm-message-wrapper">
                <div class="dm-message-bubble-row">
                    <button type="button" class="dm-message-menu-btn" title="メッセージメニュー" aria-label="メッセージメニュー">${ICONS.more}</button>
                    <div class="post-menu">
                        ${msg.type === 'user' && !msg.e2e && !msg.deleted && !msg.deleted_at ? '<button class="edit-dm-msg-btn">編集</button>' : ''}
                        <button class="delete-dm-msg-btn delete-btn">削除</button>
                    </div>
                    <div class="dm-message">${replyHtml}<div class="dm-message-content">${formattedContent}</div>${attachmentsHTML}</div>
                </div>
                <div class="dm-message-meta">
                    ${readStatusHtml}
                    <span class="dm-message-time">${time}</span>
                </div>
            </div>
        </div>`;
    } else {
        const user = getAllUsersCache().get(msg.userid) || {};
        return `<div class="dm-message-container received" data-message-id="${escapeHTML(msg.id)}" data-reply-preview-safe="${msg.type === 'user' && !msg.e2e && !msg.deleted && !msg.deleted_at ? 'true' : 'false'}">
            <a href="#profile/${user.id}" class="dm-user-link" tabindex="-1" aria-hidden="true">
                <img ${rankAvatarAttributes(user)} src="${getUserIconUrl(user)}" class="dm-message-icon" alt="">
            </a>
            <div class="dm-message-wrapper">
                <div class="dm-message-meta">
                    <a href="#profile/${user.id}" class="dm-user-link dm-user-name">${getEmoji(escapeHTML(user.name || '不明'))}</a>
                    <span class="dm-message-time">・${time}</span>
                    <button type="button" class="dm-message-menu-btn" title="メッセージメニュー" aria-label="メッセージメニュー">${ICONS.more}</button>
                    ${msg.type === 'user' && !msg.deleted && !msg.deleted_at ? '<button type="button" class="reply-dm-msg-btn">返信</button>' : ''}
                    <div class="post-menu">
                        <button class="report-dm-message-btn" data-dm-id="${escapeHTML(String(dmId || ''))}" data-message-id="${escapeHTML(String(msg.id || ''))}">報告する</button>
                    </div>
                </div>
                <div class="dm-message-bubble-row">
                    <div class="dm-message">${replyHtml}<div class="dm-message-content">${formattedContent}</div>${attachmentsHTML}</div>
                </div>
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
    const scaleValue = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-scale'));
    const scale = Number.isFinite(scaleValue) && scaleValue > 0 ? scaleValue : 1;
    const buttonRect = menuButton.getBoundingClientRect();
    const opensRightPreferred = menuButton
        .closest('.dm-message-container')
        ?.classList.contains('received');

    menu.classList.add('dm-message-menu-popover', 'is-visible');
    menu.style.maxWidth = `${Math.max(0, window.innerWidth - edgeMargin * 2) / scale}px`;

    const menuRect = menu.getBoundingClientRect();
    const menuWidth = menuRect.width;
    const menuHeight = menuRect.height;
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
    menu.style.left = `${left / scale}px`;
    menu.style.top = `${top / scale}px`;
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
        // Consumed as soon as the conversation view exists; the cap only
        // guards against pathological accumulation in the meantime.
        if (pending.length > 1000) pending.splice(0, pending.length - 1000);
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

const DM_EDIT_LOAD_LIMIT = 1000;
// 会話の再取得が必要な状態。再取得するまで古い内容を描画しない。
export const STALE_REFRESH = 1;
export const STALE_OVERFLOW = 2;
const staleDmConversations = new Map();

function isDmEditMessage(message) {
    return message?.type === 'user' && !message.e2e && !message.deleted && !message.deleted_at;
}

let dmEditLoad = null;
window.addEventListener('hashchange', () => {
    if (dmEditLoad && window.location.hash !== `#dm/${encodeURIComponent(dmEditLoad.dmId)}`) dmEditLoad = null;
});

export function beginDmEditLoad(dmId, { useCached = false } = {}) {
    const key = String(dmId);
    // 再取得が必要な状態のキャッシュは使わず、サーバーの最新内容で作り直す。
    const useCache = useCached && !staleDmConversations.has(key);
    const load = {
        dmId: key,
        edits: new Map(),
        posts: null,
        overflows: new Map(),
        awaitingFresh: staleDmConversations.has(key),
        // 破棄した編集より古いキャッシュで描画している間は既読扱いにしない。
        refreshing: staleDmConversations.has(key),
        trimNotified: false,
        useCache,
        flushPromise: null,
        refreshVersion: staleDmConversations.get(key) || 0,
    };
    dmEditLoad = load;
    return load;
}

export function isCurrentDmEditLoad(load) {
    return dmEditLoad === load && window.location.hash === `#dm/${encodeURIComponent(load.dmId)}`;
}

/**
 * 会話データを対象の読み込みへ紐付ける。
 *
 * @param {object} load 対象の読み込み
 * @param {Array} posts 会話のメッセージ一覧
 * @param {object} options
 * @param {boolean} [options.fromCache] キャッシュ済みデータか
 * @param {boolean} [options.mergeErrors] 取得失敗時点の保留編集を一覧へ反映するか
 */
export function setDmEditLoadPosts(load, posts, { fromCache = false, mergeErrors = false } = {}) {
    const active = dmEditLoad === load;
    const stale = staleDmConversations.get(load.dmId);
    // 編集を破棄したキャッシュは、再取得したサーバー内容ではなく古い内容を含む。
    const isStaleCache = fromCache && load.awaitingFresh && stale === load.refreshVersion;
    if (active) {
        load.refreshing = isStaleCache;
        load.posts = getDmEditAppliedPosts(load, posts, {
            mergeErrors: mergeErrors || getDmEditCount(load) > 0,
        });
    }
    if (isStaleCache) {
        // 古い内容を表示したままにしない。
        if (active) load.edits.clear();
        staleDmConversations.delete(load.dmId);
        return;
    }
    if (stale !== undefined && stale === load.refreshVersion) staleDmConversations.delete(load.dmId);
    if (active && load.awaitingFresh && load.overflows.size) {
        load.refreshVersion = (staleDmConversations.get(load.dmId) || 0) + 1;
        staleDmConversations.set(load.dmId, load.refreshVersion);
    } else if (active) {
        load.awaitingFresh = false;
        load.trimNotified = false;
    }
    if (active && load.edits.size) invalidateDmCaches(load.dmId);
}

export function isStaleDmConversation(dmId) {
    return staleDmConversations.has(String(dmId));
}

function mergeDmEditIntoPosts(load, message) {
    const post = load.posts?.find((item) => String(item.id) === String(message.id));
    if (post && post.type === 'user' && !post.e2e && !post.deleted && !post.deleted_at) {
        post.content = message.content;
        post.message = message.message;
    }
}

function getDmEditCount(load) {
    let count = load.edits.size;
    for (const value of load.overflows.values()) count += value;
    return count;
}

// 保留中の編集を古い順に捨ててキャッシュを破棄させ、次の表示で再取得する。
function trimDmEditLoad(load) {
    const drop = () => {
        if (load.edits.size) {
            load.edits.delete(load.edits.keys().next().value);
            return;
        }
        for (const [key, value] of load.overflows) {
            if (value <= 1) load.overflows.delete(key);
            else load.overflows.set(key, value - 1);
            return;
        }
    };
    drop();
    load.awaitingFresh = true;
    load.refreshVersion = (staleDmConversations.get(load.dmId) || 0) + 1;
    staleDmConversations.set(load.dmId, load.refreshVersion);
    invalidateDmCaches(load.dmId);
    if (dmEditLoad !== load || load.trimNotified) return;
    load.trimNotified = true;
    showAppAlert('更新が多いため、この会話の最新の内容を取得しています。');
    load.onStale?.();
}

function recordDmEdit(load, key, message) {
    load.overflows.delete(key);
    load.edits.delete(key);
    const keyed = String(message?.id) === key;
    if (keyed) load.edits.set(key, message);
    else load.overflows.set(key, (load.overflows.get(key) || 0) + 1);
    while (getDmEditCount(load) > DM_EDIT_LOAD_LIMIT) trimDmEditLoad(load);
    if (keyed) mergeDmEditIntoPosts(load, message);
}

// キャッシュ済みメッセージへ保留中の編集を重ねる。
function getDmEditAppliedPosts(load, posts, { mergeErrors = false } = {}) {
    if (!load.edits.size && !load.overflows.size) return posts;
    return posts.map((post) => {
        const key = String(post?.id ?? '');
        if (!key) return post;
        const edited = load.edits.get(key);
        if (edited) {
            const next = applyDmEditMessage(post, edited);
            return next === post ? post : next;
        }
        if (mergeErrors && load.overflows.has(key) && isDmEditMessage(post)) {
            return { ...post, message: post.content ?? post.message ?? '' };
        }
        return post;
    });
}

function applyDmEditMessage(base, update) {
    if (!update || typeof update !== 'object') return base;
    const merged = base && typeof base === 'object' ? base : {};
    const next = { ...merged, ...update };
    if (typeof update.content !== 'string' && typeof base?.content === 'string') {
        next.content = base.content;
    }
    return next;
}

/**
 * 保留中の編集を画面へ反映する。同じ会話に対する呼び出しは進行中の処理へ合流する。
 *
 * 呼び出し側は描画直後に必ず await し、戻り値が false なら古い内容を含むため描画をやり直す。
 * 後から届いた同じメッセージの編集は、進行中の処理の完了を待って反映される。
 *
 * @param {object} load 対象の読み込み
 * @param {object} options
 * @param {boolean} [options.discardIfStale] 再取得待ちなら保留中の編集を捨てて false を返す
 * @param {() => boolean} [options.isRenderActive] 呼び出し側の描画がまだ有効か
 * @returns {Promise<boolean>} この描画時点で最新状態を反映できたか
 */
export function flushDmEdits(load, { discardIfStale = false, isRenderActive = () => true } = {}) {
    if (load.flushPromise) return load.flushPromise;
    const run = async () => {
        if (load.awaitingFresh) {
            if (!discardIfStale) return false;
            for (const [key, message] of load.edits) {
                load.overflows.set(key, (load.overflows.get(key) || 0) + 1);
                if (!isDmEditMessage(message)) mergeDmEditIntoPosts(load, message);
            }
            if (load.edits.size) invalidateDmCaches(load.dmId);
            load.edits.clear();
        }
        for (const [key, message] of load.edits) {
            if (load.edits.get(key) !== message) continue;
            await updateRealtimeDmMessage(load.dmId, message, false);
        }
        return !load.awaitingFresh && isRenderActive();
    };
    let promise;
    promise = run()
        .catch((error) => {
            console.error('DM編集の反映に失敗しました:', error);
            return false;
        })
        .finally(() => {
            if (load.flushPromise === promise) load.flushPromise = null;
        });
    load.flushPromise = promise;
    return promise;
}

export async function updateRealtimeDmMessage(dmId, message, record = true) {
    if (!message?.id || window.location.hash !== `#dm/${encodeURIComponent(String(dmId))}`) return;
    const load = dmEditLoad?.dmId === String(dmId) ? dmEditLoad : null;
    if (record && load) {
        const key = String(message.id);
        const previous = load.edits.get(key);
        const applying = load.flushPromise;
        recordDmEdit(load, key, message);
        if (previous && previous !== message) {
            // 表示中の古い編集の描画が終わってから、新しい編集を描画する。
            if (applying) await applying;
            if (load.edits.get(key) !== message || load.awaitingFresh) return;
        }
    }
    if (!record && load && load.edits.get(String(message.id)) !== message) return;
    if (!isActiveDmConversation(dmId)) return;
    const view = document.querySelector('.dm-conversation-view');
    const container = view?.querySelector(`.dm-message-container[data-message-id="${CSS.escape(String(message.id))}"]`);
    const content = container?.querySelector('.dm-message-content');
    if (!content) return;
    const revision = (container._dmEditRevision || 0) + 1;
    container._dmEditRevision = revision;
    const text = message.content || message.message || '';
    await ensureMentionedUsersCached([text]);
    if (!isActiveDmConversation(dmId) || !container.isConnected || container._dmEditRevision !== revision ||
        (load && load.edits.get(String(message.id)) !== message)) return;
    content.innerHTML = text ? renderNyarkDown(text, getAllUsersCache(), { allowMarkdown: true }) : '';
    const bubble = container.querySelector('.dm-message');
    if (bubble) {
        delete bubble.dataset.clampInitialized;
        bubble.querySelector('.dm-clamp-toggle')?.remove();
        attachDmMessageClamp(bubble);
    }
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
            type: 'user',
            userid: getCurrentUser().id,
            content: text,
            message: text,
            attachments: attachmentsData,
            created_at: new Date().toISOString(),
        };

        const { error } = await api.rpc('append_to_dm_post', {
            dm_id_in: dmId,
            new_message_in: messageObject,
            request_id: createDmRequestId(),
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
        invalidateDmCaches(dmId);
        const titleEl = document.querySelector('.dm-header-title');
        if (titleEl) titleEl.innerHTML = getEmoji(escapeHTML(title));
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert(e.message || 'タイトルの更新に失敗しました');
    }
}

export async function handleRemoveDmMember(dmId, memberId, onComplete = null) {
    try {
        const { data: dm } = await api.from('dm').eq('id', dmId).single();
        if (!dm) return;
        const currentMembers = (dm.member || dm.users || []).map(Number);
        const newMembers = currentMembers.filter((id) => Number(id) !== Number(memberId));
        const { error } = await api.from('dm').update({ member: newMembers }).eq('id', dmId);
        if (error) throw error;

        const removedUser = getCachedUser(memberId);
        const name = removedUser?.name || `user${memberId}`;
        invalidateDmCaches(dmId);
        await openDmManageModal(dmId, onComplete);
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert(e.message || 'メンバーの削除に失敗しました');
    }
}

export async function handleSetHostDmMember(dmId, memberId, onComplete = null) {
    try {
        const { error } = await api.from('dm').update({ host_id: Number(memberId) }).eq('id', dmId);
        if (error) throw error;
        const newHost = getCachedUser(memberId);
        const name = newHost?.name || `user${memberId}`;
        invalidateDmCaches(dmId);
        await openDmManageModal(dmId, onComplete);
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert(e.message || 'ホストの変更に失敗しました');
    }
}

export async function handleAddDmMember(dmId, newMemberId, onComplete = null) {
    const numericId = Number(newMemberId);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
        return showAppAlert('有効なNyaitterIDを入力してください');
    }
    try {
        const { data: dm } = await api.from('dm').eq('id', dmId).single();
        if (!dm) return;
        const currentMembers = (dm.member || dm.users || []).map(Number);
        if (currentMembers.includes(numericId)) {
            return showAppAlert('このユーザーは既に参加しています');
        }
        const newMembers = Array.from(new Set([...currentMembers, numericId]));
        const { error } = await api.from('dm').update({ member: newMembers }).eq('id', dmId);
        if (error) throw error;

        const addedUser = getCachedUser(numericId);
        const name = addedUser?.name || `user${numericId}`;
        invalidateDmCaches(dmId);
        await openDmManageModal(dmId, onComplete);
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert(e.message || 'メンバーの追加に失敗しました');
    }
}

export async function handleLeaveDm(dmId, onComplete = null) {
    const confirm = await showAppConfirm('このDMグループから退出しますか？');
    if (!confirm) return;
    try {
        const { error } = await api.rpc('leave_dm', { dm_id_in: dmId });
        if (error) throw error;

        invalidateDmCaches(dmId);
        invalidateDmCaches();
        DOM.dmManageModal?.classList.add('hidden');
        window.location.hash = '#dm';
        await router();
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert(e.message || 'グループからの退出に失敗しました');
    }
}

export async function handleDisbandDm(dmId, onComplete = null) {
    const confirm = await showAppConfirm('このDMグループを解散して削除しますか？この操作は取り消せません。');
    if (!confirm) return;
    try {
        const { error } = await api.from('dm').delete().eq('id', dmId);
        if (error) throw error;
        invalidateDmCaches(dmId);
        invalidateDmCaches();
        DOM.dmManageModal?.classList.add('hidden');
        window.location.hash = '#dm';
        await router();
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert(e.message || 'グループの解散に失敗しました');
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
        const isHost = Number(dm.host_id ?? dm.host) === Number(currentUserId);
        const memberIds = (dm.member || dm.users || []).map(Number);

        const { data: members } = await api.from('user').in('id', memberIds);
        if (members) cacheUsers(members);

        content.innerHTML = `
            <div class="dm-modal-body nui-modal-body">
                <div class="modal-heading">
                    <h3 id="dm-manage-modal-title" class="nui-modal-title">DM管理</h3>
                </div>
                <div class="dm-manage-section">
                    <label class="dm-manage-label" for="dm-manage-title-input">グループ名</label>
                    <div class="dm-manage-inline-row">
                        <input id="dm-manage-title-input" class="dm-modal-input nui-input" type="text" value="${escapeHTML(dm.title || '')}" ${!isHost ? 'disabled' : ''} placeholder="未設定">
                        ${isHost ? '<button type="button" id="dm-manage-title-save-btn" class="settings-primary-button dm-manage-btn-sm nui-button" data-nui="button">変更</button>' : ''}
                    </div>
                </div>
                <div class="dm-manage-section">
                    <h4 class="dm-manage-section-title nui-section-title">参加メンバー (${memberIds.length})</h4>
                    <div class="dm-manage-member-list nui-list" data-nui="list"></div>
                </div>
                ${isHost ? `
                <div class="dm-manage-section">
                    <label class="dm-manage-label" for="dm-manage-add-input">メンバーを追加</label>
                    <div class="dm-manage-inline-row">
                        <input id="dm-manage-add-input" class="dm-modal-input nui-input" type="number" placeholder="NyaitterID (数字)">
                        <button type="button" id="dm-manage-add-btn" class="settings-primary-button dm-manage-btn-sm nui-button" data-nui="button">追加</button>
                    </div>
                </div>` : ''}
                <div class="dm-manage-actions-footer">
                    <button type="button" id="dm-manage-leave-btn" class="settings-danger-button nui-button-danger" data-nui="button-danger">グループから退出</button>
                    ${isHost ? '<button type="button" id="dm-manage-disband-btn" class="settings-danger-button nui-button-danger" data-nui="button-danger">グループを解散</button>' : ''}
                </div>
            </div>
        `;

        const listEl = content.querySelector('.dm-manage-member-list');
        memberIds.forEach((uid) => {
            const user = getCachedUser(uid) || { id: uid, name: `user${uid}` };
            const isUserHost = Number(dm.host_id ?? dm.host) === Number(uid);
            const isMe = Number(uid) === Number(currentUserId);
            const item = document.createElement('div');
            item.className = 'dm-manage-member-item nui-list-item nui-row';
            item.setAttribute('data-nui', 'list-item');
            item.innerHTML = `
                <div class="dm-manage-member-info">
                    <img ${rankAvatarAttributes(user)} src="${getUserIconUrl(user)}" class="user-icon dm-manage-member-icon nui-avatar" alt="">
                    <span class="dm-manage-member-name nui-list-title">${getEmoji(escapeHTML(user.name))}</span>
                    <span class="dm-manage-member-handle nui-list-meta">${getNyaitterId(user)}</span>
                    ${isUserHost ? '<span class="dm-manage-host-badge nui-badge nui-badge-accent">ホスト</span>' : ''}
                </div>
                <div class="dm-manage-member-actions">
                    ${isHost && !isMe ? `
                        <button type="button" class="set-host-btn group-ui-secondary-button nui-button-secondary" data-nui="button-secondary" data-uid="${uid}">ホストにする</button>
                        <button type="button" class="remove-member-btn settings-session-revoke-button nui-button-danger" data-nui="button-danger" data-uid="${uid}">削除</button>
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
            void handleLeaveDm(dmId, onComplete);
        });

        content.querySelector('#dm-manage-disband-btn')?.addEventListener('click', () => {
            void handleDisbandDm(dmId, onComplete);
        });

        modal.querySelector('.modal-close-btn')?.addEventListener('click', () => {
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
        let message = null;
        const dmConversationCacheKey = getDmCacheKey('conversation', String(dmId));
        const cachedPayload = getScreenDataCache(dmConversationCacheKey);
        const cachedDm = Array.isArray(cachedPayload?.dm) ? cachedPayload.dm[0] : cachedPayload?.dm;
        const cachedPosts = Array.isArray(cachedDm?.post) ? cachedDm.post : (Array.isArray(cachedDm?.messages) ? cachedDm.messages : []);
        message = cachedPosts.find((m) => String(m.id) === String(messageId));

        if (!message) {
            const { data: dmResult, error } = await api.from('dm').eq('id', dmId).single();
            if (!isActiveDmConversation(dmId)) return;
            if (error || !dmResult) throw new Error('DMメッセージの取得に失敗しました');
            const fetchedDm = Array.isArray(dmResult) ? dmResult[0] : dmResult;
            const fetchedPosts = Array.isArray(fetchedDm?.post) ? fetchedDm.post : (Array.isArray(fetchedDm?.messages) ? fetchedDm.messages : []);
            message = fetchedPosts.find((m) => String(m.id) === String(messageId));
        }

        if (!message) throw new Error('メッセージが見つかりませんでした');
        if (Number(message.userid) !== Number(getCurrentUser()?.id) || message.type !== 'user' || message.e2e || message.deleted || message.deleted_at) {
            throw new Error('このメッセージは編集できません');
        }

        content.innerHTML = `
            <div class="dm-modal-body nui-modal-body">
                <div class="modal-heading">
                    <h3 id="edit-dm-modal-title" class="nui-modal-title">メッセージを編集</h3>
                </div>
                <div class="dm-edit-content">
                    <div class="markdown-textarea-editor dm-edit-editor">
                        <textarea id="edit-dm-textarea" class="markdown-content-editor dm-edit-textarea" rows="4" spellcheck="true" data-markdown-content-editor data-server-input-limit="dm_content_length">${escapeHTML(message.content || message.message || '')}</textarea>
                        <div class="markdown-editor-paint" aria-hidden="true">
                            <div class="markdown-editor-placeholder"></div>
                            <div class="markdown-editor-preview hidden"></div>
                            <div class="markdown-editor-selection"></div>
                            <div class="markdown-editor-composition"></div>
                            <div class="markdown-editor-caret"></div>
                        </div>
                    </div>
                    <div class="dm-edit-footer">
                        <div class="dm-edit-tools">
                            <button type="button" class="emoji-pic-button dm-edit-tool-btn" title="絵文字を選択">${ICONS.emoji}</button>
                            <div id="emoji-picker" class="hidden"></div>
                        </div>
                        <div class="dm-edit-actions">
                            <button type="button" class="login-secondary-button dm-edit-cancel-btn nui-button-secondary" data-nui="button-secondary">キャンセル</button>
                            <button type="button" id="update-dm-btn" class="settings-primary-button nui-button" data-nui="button">保存</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const editDmEmojiBtn = content.querySelector('.emoji-pic-button');
        if (editDmEmojiBtn) {
            let editDmPickerInstance = null;
            let editDmPickerLoading = false;
            editDmEmojiBtn.addEventListener('click', async (event) => {
                event.stopPropagation();
                const existingPicker = content.querySelector('#emoji-picker');
                if (existingPicker && !existingPicker.classList.contains('hidden')) {
                    existingPicker.classList.add('hidden');
                    return;
                }
                if (existingPicker && editDmPickerInstance) {
                    existingPicker.classList.remove('hidden');
                    return;
                }
                if (editDmPickerLoading) return;
                editDmPickerLoading = true;
                try {
                    editDmPickerInstance = await emoji_picker_create({
                        triggerButton: editDmEmojiBtn,
                        onEmojiSelect: (value) => {
                            const targetEditor = content.querySelector('#edit-dm-textarea');
                            if (targetEditor && value) {
                                insertMarkdownEditorText(targetEditor, value);
                            }
                            content.querySelector('#emoji-picker')?.classList.add('hidden');
                        },
                        onClickOutside: () => {
                            content.querySelector('#emoji-picker')?.classList.add('hidden');
                        },
                    });
                    const pickerPlaceholder = content.querySelector('#emoji-picker');
                    if (pickerPlaceholder) {
                        pickerPlaceholder.replaceWith(editDmPickerInstance);
                        editDmPickerInstance.classList.remove('hidden');
                    } else {
                        content.querySelector('.dm-edit-tools')?.appendChild(editDmPickerInstance);
                    }
                } catch (error) {
                    console.error('絵文字ピッカーの初期化に失敗しました:', error);
                } finally {
                    editDmPickerLoading = false;
                }
            });
        }
        let editDmEditor = content.querySelector('#edit-dm-textarea');
        editDmEditor = attachMarkdownContentEditor(editDmEditor) || editDmEditor;
        setupMarkdownEditorPreviewButton(content, editDmEditor);

        content.querySelector('#update-dm-btn')?.addEventListener('click', async () => {
            const updatedText = getMarkdownEditorValue(content.querySelector('#edit-dm-textarea')).trim();
            if (!updatedText) return showAppAlert('メッセージを入力してください');
            modal.classList.add('hidden');
            await handleUpdateDmMessage(dmId, messageId, updatedText, onComplete);
        });

        content.querySelector('.dm-edit-cancel-btn')?.addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        modal.querySelector('.modal-close-btn')?.addEventListener('click', () => {
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
        const { data, error } = await apiRequest(`/server/api/dm/${encodeURIComponent(String(dmId))}/messages/${encodeURIComponent(String(messageId))}`, {
            method: 'PATCH', body: JSON.stringify({ content: newText }),
        });
        if (error) throw error;

        invalidateDmCaches(dmId);
        await updateRealtimeDmMessage(dmId, data?.message);
        if (typeof onComplete === 'function') {
            await onComplete();
        }
    } catch (e) {
        console.error('DM更新エラー:', e);
        showAppAlert(e.message || 'メッセージの更新に失敗しました');
    } finally {
        showLoading(false);
    }
}

export async function handleDeleteDmMessage(dmId, messageId, onComplete = null) {
    const confirm = await showAppConfirm('このメッセージを削除しますか？');
    if (!confirm) return;
    showLoading(true);

    try {
        const { error } = await apiRequest(`/server/api/dm/${encodeURIComponent(String(dmId))}/messages/${encodeURIComponent(String(messageId))}`, {
            method: 'DELETE',
        });
        if (error) throw error;

        invalidateDmCaches(dmId);
        if (typeof onComplete === 'function') {
            await onComplete();
        }
    } catch (e) {
        console.error('DM削除エラー:', e);
        showAppAlert(e.message || 'メッセージの削除に失敗しました');
    } finally {
        showLoading(false);
    }
}

export async function handleAcceptDmRequest(dmId, onComplete = null) {
    showLoading(true);
    try {
        const { error } = await apiRequest(`/server/api/dm/${encodeURIComponent(dmId)}/accept`, {
            method: 'POST',
        });
        if (error) throw error;

        invalidateDmCaches(dmId);
        if (typeof onComplete === 'function') await onComplete();
    } catch (e) {
        showAppAlert(e.message || 'DMの承認に失敗しました');
    } finally {
        showLoading(false);
    }
}

export async function handleDeclineDmRequest(dmId, onComplete = null) {
    const confirm = await showAppConfirm('このメッセージリクエストを削除しますか？');
    if (!confirm) return;
    showLoading(true);

    try {
        const { error } = await apiRequest(`/server/api/dm/${encodeURIComponent(dmId)}/decline`, {
            method: 'POST',
        });
        if (error) throw error;

        invalidateDmCaches(dmId);
        if (typeof onComplete === 'function') await onComplete();
        else window.location.hash = '#dm';
    } catch (e) {
        showAppAlert(e.message || 'メッセージリクエストの削除に失敗しました');
    } finally {
        showLoading(false);
    }
}

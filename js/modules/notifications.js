import { api } from '../api.js';
import { getCurrentUser } from '../state.js';
import { getCachedUser } from './cache.js';
import { getEmoji } from './format.js';
import { escapeHTML } from '../utils/helpers.js';

export async function sendNotification(
    to,
    type,
    post_id = null,
    reply_id = null,
    dm_id = null,
    from_user_id = null,
    content = null,
) {
    const senderId = from_user_id ?? getCurrentUser()?.id;
    if (!to || !senderId || String(to) === String(senderId)) return;

    try {
        await api.rpc('send_notification', {
            target_user_id: to,
            from_user_id: senderId,
            notification_type: type,
            related_post_id: post_id,
            related_reply_id: reply_id,
            related_dm_id: dm_id,
            notification_content: content,
        });
    } catch (error) {
        console.error('Failed to send notification:', error);
    }
}

export function normalizeStructuredNotification(notification) {
    if (!notification || typeof notification !== 'object') return null;
    const type = String(notification.type || '').trim();
    if (!type) return null;
    return {
        type,
        from: notification.from || null,
        post_id: notification.post_id || null,
        reply_id: notification.reply_id || null,
        dm_id: notification.dm_id || null,
        content: notification.content || '',
    };
}

export function notificationActorLabel(actor, fromId) {
    if (actor?.name) return actor.name;
    const cached = getCachedUser(fromId);
    if (cached?.name) return cached.name;
    return actor?.id ? `user${actor.id}` : '誰か';
}

export function getNotificationMessageSuffix(structured) {
    switch (structured.type) {
        case 'like':
            return 'さんがあなたのポストをいいねしました';
        case 'star':
            return 'さんがあなたのポストをスターしました';
        case 'repost':
            return 'さんがあなたのポストをリポストしました';
        case 'reply':
            return 'さんがあなたに返信しました';
        case 'mention':
            return 'さんがあなたをメンションしました';
        case 'follow':
            return 'さんがあなたをフォローしました';
        case 'dm':
            return 'さんからDMが届きました';
        case 'admin_notice':
            return '管理者からの通知';
        default:
            return structured.content || '新しい通知があります';
    }
}

export function getNotificationDisplayText(notification) {
    const structured = normalizeStructuredNotification(notification);
    if (!structured) return '新しい通知があります';
    if (structured.type === 'admin_notice') {
        return structured.content || '管理者からの通知があります';
    }
    const actorName = notificationActorLabel(structured.from, notification.from_id);
    return `${actorName}${getNotificationMessageSuffix(structured)}`;
}

export function appendNotificationDisplay(container, notification) {
    if (!container) return;
    const structured = normalizeStructuredNotification(notification);
    if (!structured) {
        const span = document.createElement('span');
        span.textContent = '新しい通知があります';
        container.appendChild(span);
        return;
    }

    if (structured.type === 'admin_notice') {
        const span = document.createElement('span');
        span.className = 'notification-admin-notice-text';
        span.innerHTML = getEmoji(escapeHTML(structured.content || '管理者からの通知があります'));
        container.appendChild(span);
        return;
    }

    const actorId = structured.from?.id || notification.from_id;
    const actorName = notificationActorLabel(structured.from, actorId);

    if (actorId) {
        const actorLink = document.createElement('a');
        actorLink.href = `#profile/${actorId}`;
        actorLink.className = 'notification-actor-link';
        actorLink.innerHTML = getEmoji(escapeHTML(actorName));
        container.appendChild(actorLink);
    } else {
        const actorSpan = document.createElement('span');
        actorSpan.innerHTML = getEmoji(escapeHTML(actorName));
        container.appendChild(actorSpan);
    }

    const suffixSpan = document.createElement('span');
    suffixSpan.textContent = getNotificationMessageSuffix(structured);
    container.appendChild(suffixSpan);
}

export function getNotificationTargetHash(notification) {
    const structured = normalizeStructuredNotification(notification);
    if (!structured) return '#notifications';
    if (structured.post_id) return `#post/${structured.post_id}`;
    if (structured.dm_id) return `#dm/${encodeURIComponent(structured.dm_id)}`;
    if (structured.from?.id) return `#profile/${structured.from.id}`;
    return '#notifications';
}

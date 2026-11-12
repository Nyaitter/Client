import { t } from './i18n.js';
import { api } from '../api.js';
import { getCurrentUser } from '../state.js';
import { formatPostTimestamp } from '../utils/helpers.js';

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
        console.error('通知の送信に失敗しました:', error);
    }
}

export function normalizeStructuredNotification(notification) {
    if (!notification || typeof notification !== 'object') return null;

    const id = Number(notification.id);
    if (!Number.isInteger(id)) return null;

    const target =
        notification.target && typeof notification.target === 'object'
            ? notification.target
            : null;
    const from =
        notification.from && typeof notification.from === 'object'
            ? notification.from
            : null;
    const targetPost =
        notification.target_post && typeof notification.target_post === 'object'
            ? notification.target_post
            : notification.targetPost && typeof notification.targetPost === 'object'
              ? notification.targetPost
              : null;

    return {
        id,
        type:
            typeof notification.type === 'string' && notification.type.trim()
                ? notification.type.trim()
                : 'admin_notice',
        from,
        target,
        targetPost:
            targetPost && typeof targetPost.content === 'string'
                ? { id: Number(targetPost.id), content: targetPost.content }
                : null,
        read: Boolean(notification.read),
        clicked: Boolean(notification.clicked),
        message:
            typeof notification.message === 'string'
                ? notification.message
                : typeof notification.content === 'string'
                  ? notification.content
                  : null,
        created_at: notification.created_at || null,
    };
}

export function notificationActorLabel(notification) {
    if (notification?.from?.name) return `@${notification.from.name}`;
    if (Number.isInteger(Number(notification?.from?.id))) {
        return `@#${String(notification.from.id).padStart(4, '0')}`;
    }
    return t('notification.someone');
}

export function getNotificationMessageSuffix(notification) {
    switch (notification?.type) {
        case 'post':
            return t('notification.suffix_posted');
        case 'reply':
            return t('notification.suffix_replied');
        case 'quote':
            return t('notification.suffix_quoted');
        case 'repost':
            return t('notification.suffix_reposted');
        case 'mention':
            return t('notification.suffix_mentioned');
        case 'like':
            return t('notification.suffix_liked');
        case 'star':
            return t('notification.suffix_starred');
        case 'follow':
            return t('notification.suffix_followed');
        case 'dm':
            return t('notification.suffix_dm_received');
        case 'dm_invite':
            return t('notification.suffix_dm_invited');
        case 'dm_removed':
            return t('notification.suffix_dm_removed');
        case 'dm_host_transfer':
            return t('notification.suffix_dm_host');
        case 'dm_call':
            return t('notification.suffix_called');
        case 'group_call':
            return t('notification.suffix_group_call');
        case 'group_invite':
            return t('notification.suffix_group_invite');
        case 'group_join_request':
            return t('notification.suffix_group_request');
        case 'group_announcement':
            return t('notification.suffix_group_announcement');
        case 'poll_ended':
            return t('notification.suffix_poll_ended');
        case 'admin_notice':
            return t('notification.suffix_notice');
        case 'scheduled_post':
            return t('notification.scheduled_published');
        default:
            return '';
    }
}

export function getNotificationDisplayText(notification) {
    const structured = normalizeStructuredNotification(notification);
    if (!structured) return t('notification.generic');

    if (structured.message?.trim()) return structured.message.trim();
    if (structured.type === 'login_approval') {
        return t('notification.login_approval_needed');
    }
    if (structured.type === 'account_recovery') {
        return t('notification.recovery_request');
    }
    if (structured.type === 'moderation_assignment') {
        return t('notification.request_assigned');
    }
    if (structured.type === 'moderation_action_taken') {
        return t('notification.report_upheld');
    }
    if (structured.type === 'moderation_no_action') {
        return t('notification.report_rejected');
    }
    if (structured.type === 'moderation_action') {
        return t('notification.post_visibility_changed');
    }
    if (structured.type === 'appeal_approved') {
        return t('notification.appeal_approved');
    }
    if (structured.type === 'appeal_rejected') {
        return t('notification.appeal_rejected');
    }
    if (structured.type === 'verification_approved') {
        return t('notification.verification_approved');
    }
    if (structured.type === 'verification_rejected') {
        return t('notification.verification_rejected');
    }

    const suffix = getNotificationMessageSuffix(structured);
    return suffix
        ? `${notificationActorLabel(structured)}${suffix}`
        : t('notification.generic');
}

export function appendNotificationDisplay(container, notification) {
    if (!container) return;

    const structured = normalizeStructuredNotification(notification);
    container.replaceChildren();
    if (!structured) {
        container.textContent = t('notification.generic');
        return;
    }

    const timestamp = document.createElement('div');
    timestamp.className = 'notification-timestamp nui-list-meta';
    timestamp.textContent = formatPostTimestamp({
        created_at: structured.created_at,
    });
    container.appendChild(timestamp);

    const message = document.createElement('div');
    message.className = 'notification-message';
    if (structured.message?.trim()) {
        message.textContent = structured.message.trim();
    } else {
        const actorId = Number(structured.from?.id);
        const suffix = getNotificationMessageSuffix(structured);
        if (!Number.isInteger(actorId) || !suffix) {
            message.textContent = getNotificationDisplayText(structured);
        } else {
            const actorLink = document.createElement('a');
            actorLink.className = 'notification-actor-link';
            actorLink.href = `#profile/${actorId}`;
            actorLink.textContent = notificationActorLabel(structured);
            message.append(actorLink, document.createTextNode(suffix));
        }
    }
    container.appendChild(message);

    if (typeof structured.targetPost?.content === 'string') {
        const postPreview = structured.targetPost.content
            .replace(/[\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (postPreview) {
            const preview = document.createElement('div');
            preview.className = 'notification-target-post nui-list-meta';
            preview.textContent = postPreview;
            preview.title = postPreview;
            container.appendChild(preview);
        }
    }
}

const notificationTypeTargetResolvers = {
    follow: (notification) => {
        const fromId = Number(notification.from?.id);
        return Number.isInteger(fromId) ? `#profile/${fromId}` : null;
    },
};

export function getNotificationTargetHash(notification) {
    const structured = normalizeStructuredNotification(notification);
    if (!structured) return '#notifications';

    const resolver = notificationTypeTargetResolvers[structured.type];
    if (resolver) {
        const resolved = resolver(structured);
        if (resolved) return resolved;
    }

    const target = structured.target;
    if (target?.kind === 'post' && Number.isInteger(Number(target.id))) {
        return `#post/${target.id}`;
    }
    if (target?.kind === 'dm' && Number.isInteger(Number(target.id))) {
        return `#dm/${target.id}`;
    }
    if (target?.kind === 'user' && Number.isInteger(Number(target.id))) {
        return `#profile/${target.id}`;
    }
    if (
        target?.kind === 'route' &&
        typeof target.value === 'string' &&
        target.value.startsWith('#')
    ) {
        return target.value;
    }
    if (Number.isInteger(Number(structured.from?.id))) {
        return `#profile/${structured.from.id}`;
    }
    return '#notifications';
}

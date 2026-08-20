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
    return '誰か';
}

export function getNotificationMessageSuffix(notification) {
    switch (notification?.type) {
        case 'reply':
            return ' さんがあなたのポストに返信しました。';
        case 'quote':
            return ' さんがあなたのポストを引用しました。';
        case 'repost':
            return ' さんがあなたのポストをリポストしました。';
        case 'mention':
            return ' さんがあなたをメンションしました。';
        case 'like':
            return ' さんがあなたのポストにいいねしました。';
        case 'star':
            return ' さんがあなたのポストをお気に入りに追加しました。';
        case 'follow':
            return ' さんがあなたをフォローしました。';
        case 'dm':
            return ' さんからDMが届きました。';
        case 'dm_invite':
            return ' さんがあなたをDMに招待しました。';
        case 'dm_removed':
            return ' さんによってDMから削除されました。';
        case 'dm_host_transfer':
            return ' さんからDMの管理者権限を受け取りました。';
        case 'group_invite':
            return ' さんからグループ招待が届いています。';
        case 'group_join_request':
            return ' さんからグループへの参加申請が届いています。';
        case 'group_announcement':
            return ' さんがグループアナウンスを投稿しました。';
        case 'admin_notice':
            return ' さんからお知らせがあります。';
        default:
            return '';
    }
}

export function getNotificationDisplayText(notification) {
    const structured = normalizeStructuredNotification(notification);
    if (!structured) return '新しい通知があります。';

    if (structured.message?.trim()) return structured.message.trim();
    if (structured.type === 'login_approval') {
        return '不明な場所からのログイン承認が必要です。';
    }
    if (structured.type === 'moderation_assignment') {
        return '新しいリクエストが割り当てられました。';
    }
    if (structured.type === 'moderation_action_taken') {
        return 'あなたが報告したコンテンツは、審査により不適切であると判定されました。コミュニティの健全化へのご協力に感謝します。';
    }
    if (structured.type === 'moderation_no_action') {
        return 'あなたが報告したコンテンツは、審査の結果、適切だと判定されたため対応されません。';
    }
    if (structured.type === 'appeal_approved') {
        return '異議申し立てが承認され、アカウントの凍結が解除されました。';
    }
    if (structured.type === 'appeal_rejected') {
        return '異議申し立ては審査の結果、承認されませんでした。';
    }
    if (structured.type === 'verification_approved') {
        return '認証申請が承認されました。プロフィールに認証バッジが表示されます。';
    }
    if (structured.type === 'verification_rejected') {
        return '認証申請は審査の結果、承認されませんでした。';
    }

    const suffix = getNotificationMessageSuffix(structured);
    return suffix
        ? `${notificationActorLabel(structured)}${suffix}`
        : '新しい通知があります。';
}

export function appendNotificationDisplay(container, notification) {
    if (!container) return;

    const structured = normalizeStructuredNotification(notification);
    container.replaceChildren();
    if (!structured) {
        container.textContent = '新しい通知があります。';
        return;
    }

    const timestamp = document.createElement('div');
    timestamp.className = 'notification-timestamp';
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
            preview.className = 'notification-target-post';
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

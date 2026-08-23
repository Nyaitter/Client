import { apiRequest } from '../api.js';
import {
    getCurrentUser,
    getRealtimeChannel,
    setRealtimeChannel,
    getRealtimeReconnectTimer,
    setRealtimeReconnectTimer,
    getRealtimePingTimer,
    setRealtimePingTimer,
    getRealtimeReconnectAttempts,
    setRealtimeReconnectAttempts,
    getRealtimeShouldReconnect,
    setRealtimeShouldReconnect,
    getRealtimeAuthKey,
    setRealtimeAuthKey,
    getRealtimeSummaryFreshTimer,
    setRealtimeSummaryFreshTimer,
    getDmUnreadCounts,
} from '../state.js';
import { normalizeStructuredNotification } from './notifications.js';
import { isDataSaverEnabled } from './theme.js';
import {
    invalidateDmCaches,
    queueRealtimeTimelineUpdate,
} from './cache.js';
import { appendRealtimeDmMessage } from './dm.js';
import { updateNavAndSidebars } from './sidebar.js';

const { apiWebSocketUrl } = globalThis.NyaitterClientConfig || {};

export function markRealtimeSummaryFresh() {
    const user = getCurrentUser();
    if (!user) return;
    user.nav_summary_fetched_recently = true;
    if (getRealtimeSummaryFreshTimer()) {
        clearTimeout(getRealtimeSummaryFreshTimer());
    }
    setRealtimeSummaryFreshTimer(
        setTimeout(() => {
            if (getCurrentUser()) {
                getCurrentUser().nav_summary_fetched_recently = false;
            }
        }, 10000),
    );
}

export async function refreshNavSummaryFallback() {
    const user = getCurrentUser();
    if (!user) return;
    const { data: summary, error } = await apiRequest('/server/api/ui/summary');
    if (error || !summary || !getCurrentUser()) return;
    getCurrentUser().notification_unread_count = Number(
        summary.notification_unread_count || 0,
    );
    getCurrentUser().unreadDmTotal = Number(summary.dm_unread_count || 0);
    markRealtimeSummaryFresh();
    await updateNavAndSidebars();
}

export function clearRealtimeTimers() {
    if (getRealtimeReconnectTimer()) {
        clearTimeout(getRealtimeReconnectTimer());
    }
    if (getRealtimePingTimer()) {
        clearInterval(getRealtimePingTimer());
    }
    setRealtimeReconnectTimer(null);
    setRealtimePingTimer(null);
}

export function stopRealtimeConnection() {
    setRealtimeShouldReconnect(false);
    clearRealtimeTimers();
    const socket = getRealtimeChannel();
    setRealtimeChannel(null);
    setRealtimeAuthKey(null);
    if (
        socket &&
        (socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING)
    ) {
        socket.close(1000, 'Session changed');
    }
}

export function scheduleRealtimeReconnect() {
    if (isDataSaverEnabled()) return;
    if (
        !getRealtimeShouldReconnect() ||
        !getCurrentUser() ||
        getRealtimeReconnectTimer()
    ) {
        return;
    }
    const delay = Math.min(30000, 1000 * 2 ** getRealtimeReconnectAttempts());
    setRealtimeReconnectAttempts(
        Math.min(getRealtimeReconnectAttempts() + 1, 5),
    );
    setRealtimeReconnectTimer(
        setTimeout(() => {
            setRealtimeReconnectTimer(null);
            connectRealtimeSocket();
        }, delay),
    );
}

export function handleRealtimeEvent(event) {
    const user = getCurrentUser();
    if (!user || !event || typeof event.type !== 'string') return;

    if (event.type === 'notification_new') {
        const normalized = normalizeStructuredNotification(event.notification);
        if (normalized && Array.isArray(user.notice)) {
            const exists = user.notice.some(
                (entry) => Number(entry.id) === Number(normalized.id),
            );
            if (!exists) user.notice.unshift(normalized);
        }
        user.notification_unread_count = Number(
            event.unread_count || user.notification_unread_count || 0,
        );
        markRealtimeSummaryFresh();
        void updateNavAndSidebars();
        return;
    }

    if (event.type === 'notification_unread_count') {
        user.notification_unread_count = Number(event.unread_count || 0);
        markRealtimeSummaryFresh();
        void updateNavAndSidebars();
        return;
    }

    if (event.type === 'timeline_post') {
        if (
            event.timeline === 'following' &&
            Number(event.author_id) !== Number(user.id)
        ) {
            queueRealtimeTimelineUpdate(event.post || { id: event.post_id });
        }
        return;
    }

    if (event.type === 'dm_message') {
        if (Number(event.message?.userid) === Number(user.id)) return;
        invalidateDmCaches(event.dm_id);
        void appendRealtimeDmMessage(
            event.dm_id,
            event.message,
            event.sender || null,
        );
        return;
    }

    if (event.type === 'dm_unread_count') {
        invalidateDmCaches(
            event.dm_id !== undefined && event.dm_id !== null ? event.dm_id : null,
        );
        if (event.dm_id !== undefined && event.dm_id !== null) {
            const key = String(event.dm_id);
            const newCount = Number(event.unread_count || 0);
            const prevCount = getDmUnreadCounts().get(key) || 0;
            getDmUnreadCounts().set(key, newCount);
            const prevTotal = Number(user.unreadDmTotal || 0);
            user.unreadDmTotal = Math.max(0, prevTotal - prevCount + newCount);

            const listItem = document.querySelector(
                `.dm-list-item[data-dm-id="${CSS.escape(key)}"]`,
            );
            if (listItem) {
                if (newCount > 0) {
                    listItem.classList.add('is-unread');
                } else {
                    listItem.classList.remove('is-unread');
                }
                const avatarWrap = listItem.querySelector('.dm-list-item-avatar-wrap');
                if (avatarWrap) {
                    let avatarBadge = avatarWrap.querySelector('.dm-avatar-unread-badge');
                    if (newCount > 0) {
                        if (!avatarBadge) {
                            avatarBadge = document.createElement('span');
                            avatarBadge.className = 'dm-avatar-unread-badge';
                            avatarWrap.appendChild(avatarBadge);
                        }
                        avatarBadge.textContent = String(newCount);
                    } else if (avatarBadge) {
                        avatarBadge.remove();
                    }
                }
            }
        } else {
            user.unreadDmTotal = Number(event.unread_count || 0);
        }
        markRealtimeSummaryFresh();
        void updateNavAndSidebars();
    }

    if (event.type === 'dm_read') {
        const eventDmId = String(event.dm_id);
        const activeDmId = getActiveDmId();
        if (activeDmId && String(activeDmId) === eventDmId) {
            const sentContainers = document.querySelectorAll('.dm-message-container.sent');
            sentContainers.forEach((container) => {
                const meta = container.querySelector('.dm-message-meta');
                if (meta) {
                    let readStatus = meta.querySelector('.dm-message-read-status');
                    if (!readStatus) {
                        readStatus = document.createElement('span');
                        readStatus.className = 'dm-message-read-status';
                        const timeEl = meta.querySelector('.dm-message-time');
                        if (timeEl) {
                            meta.insertBefore(readStatus, timeEl);
                        } else {
                            meta.appendChild(readStatus);
                        }
                    }
                    readStatus.textContent = '既読';
                }
            });
        }
    }
}

export function connectRealtimeSocket() {
    if (isDataSaverEnabled()) {
        stopRealtimeConnection();
        return;
    }
    if (!getRealtimeShouldReconnect() || !getCurrentUser()) return;
    const authKey = 'cookie';
    if (
        getRealtimeChannel() &&
        getRealtimeAuthKey() === authKey &&
        (getRealtimeChannel().readyState === WebSocket.OPEN ||
            getRealtimeChannel().readyState === WebSocket.CONNECTING)
    ) {
        return;
    }
    if (getRealtimeChannel()) stopRealtimeConnection();
    setRealtimeShouldReconnect(true);

    if (!apiWebSocketUrl) return;
    const socket = new WebSocket(apiWebSocketUrl('/realtime'));
    setRealtimeChannel(socket);
    setRealtimeAuthKey(authKey);

    socket.onopen = () => {
        if (getRealtimeChannel() !== socket) return;
        setRealtimeReconnectAttempts(0);
        void refreshNavSummaryFallback();
        if (getRealtimePingTimer()) clearInterval(getRealtimePingTimer());
        setRealtimePingTimer(
            setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'ping' }));
                }
            }, 25000),
        );
    };

    socket.onmessage = (message) => {
        try {
            handleRealtimeEvent(JSON.parse(message.data));
        } catch (_) {}
    };

    socket.onerror = () => {};

    socket.onclose = () => {
        if (getRealtimeChannel() !== socket) return;
        setRealtimeChannel(null);
        setRealtimeAuthKey(null);
        if (getRealtimePingTimer()) clearInterval(getRealtimePingTimer());
        setRealtimePingTimer(null);
        if (!isDataSaverEnabled()) {
            refreshNavSummaryFallback();
            scheduleRealtimeReconnect();
        }
    };
}

export function subscribeToChanges() {
    if (isDataSaverEnabled()) {
        stopRealtimeConnection();
        return;
    }
    setRealtimeShouldReconnect(true);
    connectRealtimeSocket();
}

export function unsubscribeFromChanges() {
    stopRealtimeConnection();
}

export function applyDataSaverRealtimePreference() {
    if (!getCurrentUser()) return;
    if (isDataSaverEnabled()) unsubscribeFromChanges();
    else subscribeToChanges();
}

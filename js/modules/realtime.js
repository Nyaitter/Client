// The call stack (callsCore) is only needed while a call is active. Call
// events are always consumed by the call handler (events for rooms without
// an open call panel are dropped there), so dispatch can safely go through
// a lazy import: the first call event loads the stack, later events reuse
// the same promise and therefore stay in arrival order.
let callsModulePromise = null;
function loadCallsModule() {
    if (!callsModulePromise) {
        callsModulePromise = import('./calls.js');
    }
    return callsModulePromise;
}
function dispatchCallEvent(event) {
    void loadCallsModule()
        .then((module) => module.handleCallEvent(event))
        .catch(() => {});
}
function notifyCallConnectionClosed() {
    if (!callsModulePromise) return;
    void callsModulePromise
        .then((module) => module.callConnectionClosed())
        .catch(() => {});
}
import { t } from './i18n.js';
import { apiRequest } from '../api.js';
import { trackRealtimeUsage } from './networkUsage.js';
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
    getActiveDmId,
} from '../state.js';
import { normalizeStructuredNotification } from './notifications.js';
import { isDataSaverEnabled } from './theme.js';
import {
    invalidateDmCaches,
    queueRealtimeTimelineUpdate,
} from './cache.js';
import { appendRealtimeDmMessage, updateRealtimeDmMessage } from './dm.js';
import { updateNavAndSidebars } from './sidebar.js';

const { apiWebSocketUrl } = globalThis.NyaitterClientConfig || {};
let guestRealtime = false;

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
    guestRealtime = false;
    notifyCallConnectionClosed();
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
        (!getCurrentUser() && !guestRealtime) ||
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
            connectRealtimeSocket(guestRealtime);
        }, delay),
    );
}

export function handleRealtimeEvent(event) {
    const user = getCurrentUser();
    if (!event || typeof event.type !== 'string') return;
    if (event.type.startsWith('call:')) {
        dispatchCallEvent(event);
        return;
    }
    if (!user) return;

    if (event.type === 'notification_new') {
        const normalized = normalizeStructuredNotification(event.notification);
        let changed = false;
        if (normalized && Array.isArray(user.notice)) {
            const exists = user.notice.some(
                (entry) => Number(entry.id) === Number(normalized.id),
            );
            if (!exists) {
                user.notice.unshift(normalized);
                changed = true;
            }
        }
        const nextUnreadCount = Number(
            event.unread_count || user.notification_unread_count || 0,
        );
        if (Number(user.notification_unread_count || 0) !== nextUnreadCount) {
            user.notification_unread_count = nextUnreadCount;
            changed = true;
        }
        markRealtimeSummaryFresh();
        if (changed) void updateNavAndSidebars();
        return;
    }

    if (event.type === 'notification_unread_count') {
        const nextUnreadCount = Number(event.unread_count || 0);
        const changed = Number(user.notification_unread_count || 0) !== nextUnreadCount;
        user.notification_unread_count = nextUnreadCount;
        markRealtimeSummaryFresh();
        if (changed) void updateNavAndSidebars();
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

    if (event.type === 'dm_message_edited') {
        invalidateDmCaches(event.dm_id);
        void updateRealtimeDmMessage(event.dm_id, event.message);
        return;
    }

    if (event.type === 'dm_unread_count') {
        invalidateDmCaches(
            event.dm_id !== undefined && event.dm_id !== null ? event.dm_id : null,
        );
        let changed = false;
        if (event.dm_id !== undefined && event.dm_id !== null) {
            const key = String(event.dm_id);
            const newCount = String(getActiveDmId() || '') === key
                ? 0
                : Number(event.unread_count || 0);
            const prevCount = getDmUnreadCounts().get(key) || 0;
            changed = prevCount !== newCount;
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
            const nextTotal = Number(event.unread_count || 0);
            changed = Number(user.unreadDmTotal || 0) !== nextTotal;
            user.unreadDmTotal = nextTotal;
        }
        markRealtimeSummaryFresh();
        if (changed) void updateNavAndSidebars();
        return;
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
                    readStatus.textContent = t('dm.read_status');
                }
            });
        }
        return;
    }
}

export function connectRealtimeSocket(guestMode = guestRealtime) {
    if (isDataSaverEnabled()) {
        stopRealtimeConnection();
        return;
    }
    if (!getRealtimeShouldReconnect() || (!getCurrentUser() && !guestMode)) return;
    const authKey = guestMode ? 'guest' : 'cookie';
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
    trackRealtimeUsage(socket);
    setRealtimeChannel(socket);
    setRealtimeAuthKey(authKey);

    socket.onopen = () => {
        if (getRealtimeChannel() !== socket) return;
        setRealtimeReconnectAttempts(0);
        if (!guestMode) void refreshNavSummaryFallback();
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
        notifyCallConnectionClosed();
        setRealtimeChannel(null);
        setRealtimeAuthKey(null);
        if (getRealtimePingTimer()) clearInterval(getRealtimePingTimer());
        setRealtimePingTimer(null);
        if (!isDataSaverEnabled()) {
            if (!guestMode) refreshNavSummaryFallback();
            scheduleRealtimeReconnect();
        }
    };
}

export function waitForRealtimeOpen(timeoutMs = 8000) {
    const socket = getRealtimeChannel();
    if (socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (isDataSaverEnabled()) {
        return Promise.reject(new Error(t('realtime.datasaver_blocked')));
    }
    setRealtimeShouldReconnect(true);
    if (socket?.readyState !== WebSocket.CONNECTING) {
        if (socket) setRealtimeChannel(null);
        connectRealtimeSocket(guestRealtime);
    }
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const poll = () => {
            const current = getRealtimeChannel();
            if (current?.readyState === WebSocket.OPEN) return resolve();
            if (Date.now() - startedAt > timeoutMs) {
                return reject(new Error(t('call.disconnected')));
            }
            setTimeout(poll, 100);
        };
        poll();
    });
}

export function connectGuestRealtime() {
    guestRealtime = true;
    setRealtimeShouldReconnect(true);
    const current = getRealtimeChannel();
    if (current?.readyState === WebSocket.OPEN) return Promise.resolve();
    connectRealtimeSocket(true);
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const poll = () => {
            const socket = getRealtimeChannel();
            if (!guestRealtime) return reject(new Error(t('realtime.guest_aborted')));
            if (socket?.readyState === WebSocket.OPEN) return resolve();
            if (Date.now() - startedAt > 10000) return reject(new Error(t('realtime.guest_failed')));
            setTimeout(poll, 100);
        };
        poll();
    });
}

export function stopGuestRealtime() {
    if (guestRealtime) stopRealtimeConnection();
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

export function applyDataSaverButtonState(enabled = isDataSaverEnabled()) {
    const isDisabled = Boolean(enabled);
    const targets = [
        document.getElementById('settings-reset-network-usage'),
        document.querySelector('[data-action="refresh-realtime-timeline"]'),
    ];
    for (const target of targets) {
        if (!target) continue;
        target.disabled = isDisabled;
        target.toggleAttribute('disabled', isDisabled);
        target.setAttribute('aria-disabled', String(isDisabled));
        target.style.opacity = isDisabled ? '0.5' : '';
        target.style.cursor = isDisabled ? 'not-allowed' : '';
        target.classList.toggle('is-disabled-by-data-saver', isDisabled);
    }
}

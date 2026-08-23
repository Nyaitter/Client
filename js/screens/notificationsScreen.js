import { DOM } from '../dom.js';
import { api, apiRequest } from '../api.js';
import {
    getCurrentUser,
    getPostLoadObserver,
    setPostLoadObserver,
} from '../state.js';
import {
    normalizeStructuredNotification,
    appendNotificationDisplay,
} from '../modules/notifications.js';
import { updateNavAndSidebars } from '../modules/sidebar.js';
import { createViewportObserver } from '../utils/viewport.js';
import { getNotificationsPerPage, setupTimelinePullToRefresh } from '../modules/theme.js';
import { showLoading, showAppAlert, showAppConfirm } from '../utils/helpers.js';

export async function showNotificationsScreen(showScreenFn = null) {
    if (!getCurrentUser()) {
        DOM.pageHeader.innerHTML = `<h2 id="page-title">通知</h2>`;
        if (typeof showScreenFn === 'function') {
            showScreenFn('notifications-screen');
        } else {
            document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
            document.getElementById('notifications-screen')?.classList.remove('hidden');
        }
        DOM.notificationsContent.innerHTML =
            '<p style="padding: 2rem; text-align:center; color: var(--secondary-text-color);">通知を見るにはログインが必要です。</p>';
        showLoading(false);
        return;
    }

    DOM.pageHeader.innerHTML = `
        <div class="header-with-action-button">
            <h2 id="page-title">通知</h2>
            <button id="mark-all-read-btn" class="header-action-btn">すべて既読</button>
        </div>`;

    if (typeof showScreenFn === 'function') {
        showScreenFn('notifications-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('notifications-screen')?.classList.remove('hidden');
    }

    if (getPostLoadObserver()) {
        getPostLoadObserver().disconnect();
        setPostLoadObserver(null);
    }
    const contentDiv = DOM.notificationsContent;
    contentDiv.innerHTML = '<div class="spinner"></div>';

    setupTimelinePullToRefresh(async (context) => {
        if (context?.type !== 'notifications') return;
        await showNotificationsScreen(showScreenFn);
    });

    document
        .getElementById('mark-all-read-btn')
        ?.addEventListener('click', async () => {
            if (!(await showAppConfirm('すべての通知を既読にしますか？'))) return;

            showLoading(true);
            try {
                const { data, error } = await api.rpc(
                    'mark_all_notifications_as_clicked',
                    { p_user_id: getCurrentUser().id },
                );
                if (error) throw error;

                if (getCurrentUser().notice) {
                    getCurrentUser().notice.forEach((n) => {
                        n.read = true;
                        n.clicked = true;
                    });
                }
                getCurrentUser().notification_unread_count = Number(
                    data?.notification_unread_count || 0,
                );
                await showNotificationsScreen(showScreenFn);
                await updateNavAndSidebars();
            } catch (e) {
                console.error('すべて既読処理でエラー:', e);
                showAppAlert('処理中にエラーが発生しました。');
            } finally {
                showLoading(false);
            }
        });

    try {
        const NOTIFICATIONS_PER_PAGE = getNotificationsPerPage();
        let notificationOffset = 0;
        let hasMoreNotifications = true;
        let isLoadingMoreNotifications = false;
        const renderedNotificationIds = new Set();
        const trigger = document.createElement('div');
        trigger.className = 'load-more-trigger';
        contentDiv.innerHTML = '';
        contentDiv.appendChild(trigger);

        const appendNotifications = (notifications) => {
            notifications.forEach((notification) => {
                const notificationId = String(notification.id);
                if (renderedNotificationIds.has(notificationId)) return;
                renderedNotificationIds.add(notificationId);

                const noticeEl = document.createElement('div');
                noticeEl.className = 'widget-item notification-item';
                if (!notification.clicked) {
                    noticeEl.classList.add('notification-new');
                }
                if (notification.clicked) {
                    noticeEl.classList.add('notification-clicked');
                }
                noticeEl.dataset.notificationId = notification.id;
                noticeEl.dataset.notificationClicked = String(notification.clicked);

                const content = document.createElement('div');
                content.className = 'notification-item-content';
                appendNotificationDisplay(content, notification);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'notification-delete-btn';
                deleteBtn.innerHTML = '×';
                deleteBtn.title = '通知を削除';

                noticeEl.appendChild(content);
                noticeEl.appendChild(deleteBtn);
                contentDiv.insertBefore(noticeEl, trigger);
            });
        };

        let preloadNotificationsPromise = null;
        const triggerPreloadNextNotifications = (nextOffset) => {
            if (!hasMoreNotifications || !getCurrentUser()) return;
            preloadNotificationsPromise = apiRequest(
                `/server/api/notifications?limit=${NOTIFICATIONS_PER_PAGE}&offset=${nextOffset}`,
            ).catch(() => null);
        };

        const loadMoreNotifications = async () => {
            if (isLoadingMoreNotifications || !hasMoreNotifications || !getCurrentUser()) {
                return;
            }

            isLoadingMoreNotifications = true;
            trigger.innerHTML = '<div class="spinner"></div>';
            try {
                let notificationPayload;
                let error;
                if (preloadNotificationsPromise) {
                    const res = await preloadNotificationsPromise;
                    preloadNotificationsPromise = null;
                    notificationPayload = res?.data;
                    error = res?.error;
                } else {
                    const res = await apiRequest(
                        `/server/api/notifications?limit=${NOTIFICATIONS_PER_PAGE}&offset=${notificationOffset}`,
                    );
                    notificationPayload = res?.data;
                    error = res?.error;
                }
                if (error) throw error;

                const notifications = (
                    notificationPayload?.notifications || []
                )
                    .map(normalizeStructuredNotification)
                    .filter(Boolean);
                const currentNotifications = Array.isArray(getCurrentUser().notice)
                    ? getCurrentUser().notice
                    : [];
                if (notificationOffset === 0) {
                    getCurrentUser().notice = notifications;
                } else {
                    const existingIds = new Set(
                        currentNotifications.map((n) => String(n.id)),
                    );
                    notifications.forEach((n) => {
                        if (existingIds.has(String(n.id))) return;
                        existingIds.add(String(n.id));
                        currentNotifications.push(n);
                    });
                    getCurrentUser().notice = currentNotifications;
                }
                getCurrentUser().notification_unread_count = Number(
                    notificationPayload?.notification_unread_count || 0,
                );
                getCurrentUser().nav_summary_fetched_recently = false;

                appendNotifications(notifications);
                notificationOffset += notifications.length;
                if (notifications.length < NOTIFICATIONS_PER_PAGE) {
                    hasMoreNotifications = false;
                    trigger.textContent =
                        notificationOffset > 0
                            ? 'すべての通知を読み込みました'
                            : '通知はまだありません。';
                    if (getPostLoadObserver()) getPostLoadObserver().disconnect();
                } else {
                    trigger.textContent = '';
                    triggerPreloadNextNotifications(notificationOffset);
                }
            } catch (error) {
                console.error('通知の取得に失敗しました:', error);
                hasMoreNotifications = false;
                trigger.textContent =
                    notificationOffset > 0
                        ? '通知の追加読み込みに失敗しました。'
                        : '通知の読み込みに失敗しました。';
                if (getPostLoadObserver()) getPostLoadObserver().disconnect();
            } finally {
                isLoadingMoreNotifications = false;
            }
        };

        setPostLoadObserver(
            createViewportObserver(
                (entries) => {
                    if (entries[0].isIntersecting) {
                        void loadMoreNotifications();
                    }
                },
                { rootMargin: '200px' },
            ),
        );
        getPostLoadObserver().observe(trigger);
        await loadMoreNotifications();

        try {
            const { data: readAllOnOpenData, error: readAllOnOpenError } =
                await apiRequest('/server/api/notifications/read-all', {
                    method: 'PUT',
                });
            if (readAllOnOpenError) {
                console.error('通知一覧表示後の既読化に失敗しました:', readAllOnOpenError);
            } else {
                if (getCurrentUser()?.notice) {
                    getCurrentUser().notice.forEach((notification) => {
                        notification.read = true;
                    });
                }
                if (getCurrentUser()) {
                    getCurrentUser().notification_unread_count = Number(
                        readAllOnOpenData?.notification_unread_count || 0,
                    );
                    getCurrentUser().nav_summary_fetched_recently = false;
                }
                void updateNavAndSidebars();
            }
        } catch (readErr) {
            console.error('通知一覧既読化エラー:', readErr);
        }
    } catch (e) {
        console.error('通知画面エラー:', e);
        contentDiv.innerHTML = `<p class="error-message">通知の読み込みに失敗しました。</p>`;
    } finally {
        showLoading(false);
    }
}

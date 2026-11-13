import { DOM } from '../dom.js';
import { t } from '../modules/i18n.js';
import { api, apiRequest } from '../api.js';
import {
    getCurrentUser,
    getPostLoadObserver,
    setPostLoadObserver,
} from '../state.js';
import {
    normalizeStructuredNotification,
} from '../modules/notifications.js';
import { updateNavAndSidebars } from '../modules/sidebar.js';
import { createViewportObserver } from '../utils/viewport.js';
import { getNotificationsPerPage, setupTimelinePullToRefresh } from '../modules/theme.js';
import { showLoading, showAppAlert, showAppConfirm } from '../utils/helpers.js';
import { getActiveScreenContext, showScreenCompat } from '../screenManager.js';
export async function showNotificationsScreen(showScreenFn = null) {
    function renderNotificationsHeader() {
        DOM.pageHeader.innerHTML = `
            <div class="header-with-action-button">
                <h2 id="page-title">${t('notifications.title')}</h2>
                <button type="button" class="header-action-btn nui-button-secondary" data-nui="button-secondary" data-action="mark-all-read">${t('notifications.mark_all')}</button>
            </div>`;
    }

    function renderLoggedOut() {
        DOM.notificationsContent.innerHTML = `<p class="nui-empty-text">${t('notifications.login_required')}</p>`;
    }

    function renderLoading(content) {
        if (content) content.innerHTML = '<div class="spinner"></div>';
    }

    function createNotificationElement(notification) {
        const element = document.createElement('div');
        element.className = 'notification-item';
        element.dataset.notificationId = notification.id;
        const iconData = notification.icon_data || notification.avatar_data;
        element.innerHTML = `
            <div class="notification-icon"></div>
            <div class="notification-content"></div>
            <div class="notification-meta"></div>`;
        const iconCell = element.querySelector('.notification-icon');
        const contentCell = element.querySelector('.notification-content');
        const metaCell = element.querySelector('.notification-meta');
        const { icon, title, body } = normalizeStructuredNotification(notification);
        if (iconCell) iconCell.innerHTML = icon || '';
        if (contentCell) contentCell.innerHTML = `<div class="notification-title">${escapeHTML(title || '')}</div><div class="notification-body">${body || ''}</div>`;
        if (metaCell) metaCell.innerHTML = `<span class="notification-timestamp">${escapeHTML(notification.created_at_formatted || '')}</span>`;
        return element;
    }

    function renderEmptyState(trigger, hasNotifications) {
        const text = hasNotifications ? t('notifications.no_filtered') : t('notifications.empty');
        if (trigger) trigger.innerHTML = `<p class="nui-empty-text">${text}</p>`;
    }

    function renderLoadError(trigger, hasNotifications) {
        const text = hasNotifications ? t('notifications.load_more_error') : t('notifications.load_error');
        if (trigger) trigger.innerHTML = `<p class="error-message">${text}</p>`;
    }

    function renderError(content) {
        if (content) content.innerHTML = `<p class="error-message">${t('notifications.load_error')}</p>`;
    }
    if (!getCurrentUser()) {
        DOM.pageHeader.innerHTML = `<h2 id="page-title">${t('notifications.title')}</h2>`;
        showScreenCompat('notifications-screen', showScreenFn);
        renderLoggedOut();
        showLoading(false);
        return;
    }

    renderNotificationsHeader();

    showScreenCompat('notifications-screen', showScreenFn);

    const screenContext = getActiveScreenContext();
    const signal = screenContext?.signal;
    const requestOptions = (options = {}) => ({ ...options, signal });

    if (getPostLoadObserver()) {
        getPostLoadObserver().disconnect();
        setPostLoadObserver(null);
    }
    const contentDiv = DOM.notificationsContent;
    contentDiv.classList.add('nui-list', 'nui-list--flush');
    contentDiv.setAttribute('data-nui', 'list');
    renderLoading(contentDiv);

    setupTimelinePullToRefresh(async (context) => {
        if (context?.type !== 'notifications') return;
        await showNotificationsScreen(showScreenFn);
    });

    document
        .getElementById('mark-all-read-btn')
        ?.addEventListener('click', async () => {
            if (!(await showAppConfirm(t('notifications.mark_all_confirm')))) return;

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
                showAppAlert(t('notifications.error'));
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

                const noticeEl = createNotificationElement(notification);
                contentDiv.insertBefore(noticeEl, trigger);
            });
        };

        let preloadNotificationsPromise = null;
        const triggerPreloadNextNotifications = (nextOffset) => {
            if (!hasMoreNotifications || !getCurrentUser()) return;
            preloadNotificationsPromise = apiRequest(
                `/server/api/notifications?limit=${NOTIFICATIONS_PER_PAGE}&offset=${nextOffset}`,
                requestOptions(),
            ).catch(() => null);
        };

        const loadMoreNotifications = async () => {
            if (signal?.aborted || isLoadingMoreNotifications || !hasMoreNotifications || !getCurrentUser()) {
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
                        requestOptions(),
                    );
                    notificationPayload = res?.data;
                    error = res?.error;
                }
                if (error) throw error;
                if (signal?.aborted) return;

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
                    renderEmptyState(trigger, notificationOffset > 0);
                    if (getPostLoadObserver()) getPostLoadObserver().disconnect();
                } else {
                    trigger.textContent = '';
                    triggerPreloadNextNotifications(notificationOffset);
                    requestAnimationFrame(() => {
                        if (signal?.aborted || !hasMoreNotifications || isLoadingMoreNotifications || !getCurrentUser()) return;
                        const rect = trigger.getBoundingClientRect();
                        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
                        if (rect.top <= vh + 300 && rect.bottom >= -300) {
                            void loadMoreNotifications();
                        }
                    });
                }
            } catch (error) {
                console.error('通知の取得に失敗しました:', error);
                hasMoreNotifications = false;
                renderLoadError(trigger, notificationOffset > 0);
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
                { rootMargin: '300px' },
            ),
        );
        const notificationObserver = getPostLoadObserver();
        notificationObserver.observe(trigger);
        screenContext?.addCleanup(() => notificationObserver.disconnect());
        await loadMoreNotifications();

        try {
            const { data: readAllOnOpenData, error: readAllOnOpenError } =
                await apiRequest('/server/api/notifications/read-all', requestOptions({
                    method: 'PUT',
                }));
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
        if (!signal?.aborted) renderError(contentDiv);
    } finally {
        if (!signal?.aborted) showLoading(false);
    }
}

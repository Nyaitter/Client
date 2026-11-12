import { t } from '../../modules/i18n.js';
import { DOM } from '../../dom.js';
import { appendNotificationDisplay } from '../../modules/notifications.js';

export function renderHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-action-button">
            <h2 id="page-title">${t('nav.notifications')}</h2>
            <button id="mark-all-read-btn" class="header-action-btn nui-button-secondary" data-nui="button-secondary">${t('notifview.mark_all_read')}</button>
        </div>`;
}

export function renderLoggedOut() {
    if (DOM.notificationsContent) {
        DOM.notificationsContent.innerHTML = `<p class="notifications-empty-message nui-empty-text">${t('notifview.login_required')}</p>`;
    }
}

export function renderLoading(content) {
    if (content) content.innerHTML = `<div class="spinner" aria-label="${t('common.loading')}"></div>`;
}

export function createNotificationElement(notification) {
    const notice = document.createElement('div');
    notice.className = 'widget-item notification-item nui-list-item';
    if (!notification.clicked) notice.classList.add('notification-new');
    if (notification.clicked) notice.classList.add('notification-clicked');
    notice.dataset.notificationId = notification.id;
    notice.dataset.notificationClicked = String(notification.clicked);

    const content = document.createElement('div');
    content.className = 'notification-item-content nui-list-copy';
    appendNotificationDisplay(content, notification);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'notification-delete-btn nui-button-danger';
    deleteButton.textContent = '×';
    deleteButton.title = t('notifview.delete_title');
    notice.append(content, deleteButton);
    return notice;
}

export function renderEmptyState(trigger, hasNotifications) {
    if (trigger) {
        trigger.textContent = hasNotifications
            ? t('notifview.all_loaded')
            : t('notifview.empty');
    }
}

export function renderLoadError(trigger, hasNotifications) {
    if (trigger) {
        trigger.textContent = hasNotifications
            ? t('notifview.load_more_failed')
            : t('notifview.load_failed');
    }
}

export function renderError(content) {
    if (content) content.innerHTML = `<p class="error-message">${t('notifview.load_failed')}</p>`;
}

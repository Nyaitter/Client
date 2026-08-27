import { DOM } from '../../dom.js';
import { appendNotificationDisplay } from '../../modules/notifications.js';

export function renderHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-action-button">
            <h2 id="page-title">通知</h2>
            <button id="mark-all-read-btn" class="header-action-btn">すべて既読</button>
        </div>`;
}

export function renderLoggedOut() {
    if (DOM.notificationsContent) {
        DOM.notificationsContent.innerHTML = '<p class="notifications-empty-message">通知を見るにはログインが必要です。</p>';
    }
}

export function renderLoading(content) {
    if (content) content.innerHTML = '<div class="spinner" aria-label="読み込み中"></div>';
}

export function createNotificationElement(notification) {
    const notice = document.createElement('div');
    notice.className = 'widget-item notification-item';
    if (!notification.clicked) notice.classList.add('notification-new');
    if (notification.clicked) notice.classList.add('notification-clicked');
    notice.dataset.notificationId = notification.id;
    notice.dataset.notificationClicked = String(notification.clicked);

    const content = document.createElement('div');
    content.className = 'notification-item-content';
    appendNotificationDisplay(content, notification);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'notification-delete-btn';
    deleteButton.textContent = '×';
    deleteButton.title = '通知を削除';
    notice.append(content, deleteButton);
    return notice;
}

export function renderEmptyState(trigger, hasNotifications) {
    if (trigger) {
        trigger.textContent = hasNotifications
            ? 'すべての通知を読み込みました'
            : '通知はまだありません。';
    }
}

export function renderLoadError(trigger, hasNotifications) {
    if (trigger) {
        trigger.textContent = hasNotifications
            ? '通知の追加読み込みに失敗しました。'
            : '通知の読み込みに失敗しました。';
    }
}

export function renderError(content) {
    if (content) content.innerHTML = '<p class="error-message">通知の読み込みに失敗しました。</p>';
}

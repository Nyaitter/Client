/**
 * events.js
 * Global delegated event handlers for click, keydown, submit, hashchange, etc.
 * All event listeners are attached once at app startup to avoid memory leaks.
 */

import { api, apiRequest } from './api.js';
import { DOM } from './dom.js';
import { getCurrentUser, getCurrentTimelineTab } from './state.js';
import { router } from './router.js';
import { clearRealtimeTimelineUpdate } from './modules/cache.js';
import { switchTimelineTab } from './screens/timelineScreen.js';
import { openReportModal, closeReportModal } from './screens/adminScreen.js';
import {
    openEditPostModal,
    openRepostModal,
    copyPost,
    pinPost,
    deletePost,
    handleReplyClick,
    handleLike,
    handleStar,
    handleShowMaskedPost,
} from './modules/posts.js';
import {
    openDmEditModal,
    handleDeleteDmMessage,
    positionDmMessageMenu,
} from './modules/dm.js';
import { getNotificationTargetHash } from './modules/notifications.js';
import { updateNavAndSidebars } from './modules/sidebar.js';
import { beginScrollRouteTransition } from './modules/scroll.js';
import { goToLoginPage } from './modules/auth.js';
import {
    getSafeHttpUrl,
    copyTextToClipboard,
    showAppAlert,
} from './utils/helpers.js';

/**
 * Attach all global delegated event listeners.
 * Call this once from initApp().
 */
export function setupGlobalEventListeners() {
    // ---- Click handler ----
    document.addEventListener('click', handleGlobalClick);

    // ---- 「再試行」ボタン ----
    DOM.retryConnectionBtn?.addEventListener('click', async () => {
        DOM.connectionErrorOverlay?.classList.add('hidden');
        const { loadServerClientLimits } = await import('./app.js');
        if (!(await loadServerClientLimits())) return;
        const { checkSession } = await import('./modules/auth.js');
        void checkSession();
    });

    // ---- hashchange → router ----
    window.addEventListener('hashchange', router);

    // ---- Image modal close ----
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('image-modal')?.classList.add('hidden');
            document.getElementById('report-modal')?.classList.add('hidden');
        }
    });
}

// ---------------------------------------------------------------------------
// handleGlobalClick — master delegated click handler
// ---------------------------------------------------------------------------
function handleGlobalClick(e) {
    const target = e.target;

    // ── Hash link navigation ──────────────────────────────────────────────
    const hashLink = target.closest('a[href^="#"]');
    const isPlainHashNavigation =
        hashLink &&
        e.button === 0 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey;
    if (isPlainHashNavigation) {
        e.preventDefault();
        const destinationHash = hashLink.getAttribute('href') || '#';
        const currentHash = window.location.hash || '#';
        if (destinationHash !== currentHash) {
            beginScrollRouteTransition();
            window.location.hash = destinationHash;
        }
        return;
    }

    // ── data-action dispatch ──────────────────────────────────────────────
    const actionTarget = target.closest('[data-action]');
    const action = actionTarget?.dataset.action;

    if (action === 'refresh-realtime-timeline') {
        e.preventDefault();
        clearRealtimeTimelineUpdate();
        void switchTimelineTab(getCurrentTimelineTab(), {
            forceRefresh: true,
            resetScroll: true,
        });
        return;
    }

    if (action === 'history-back') {
        e.preventDefault();
        window.history.back();
        return;
    }

    if (action === 'open-create-dm') {
        e.preventDefault();
        window.openCreateDmModal?.();
        return;
    }

    if (action === 'open-dm-manage') {
        const dmId = String(actionTarget.dataset.dmId || '').trim();
        if (dmId && dmId.length <= 128) {
            e.preventDefault();
            e.stopPropagation();
            window.openDmManageModal?.(dmId);
        }
        return;
    }

    if (action === 'open-image') {
        const imageUrl = getSafeHttpUrl(actionTarget.dataset.url);
        if (imageUrl) {
            e.preventDefault();
            e.stopPropagation();
            window.openImageModal?.(imageUrl);
        }
        return;
    }

    if (action === 'download-attachment') {
        const downloadUrl = getSafeHttpUrl(actionTarget.dataset.url);
        if (downloadUrl) {
            e.preventDefault();
            e.stopPropagation();
            window.handleDownload?.(
                downloadUrl,
                String(actionTarget.dataset.name || '添付ファイル').slice(0, 255),
            );
        }
        return;
    }

    if (action === 'open-admin-report') {
        const reportId = Number(actionTarget.dataset.reportId);
        if (Number.isInteger(reportId) && reportId > 0) {
            e.preventDefault();
            window.location.hash = `#admin/reports/${reportId}`;
        }
        return;
    }

    if (action === 'open-dm') {
        const dmId = String(actionTarget.dataset.dmId || '').trim();
        if (dmId && dmId.length <= 128)
            window.location.hash = `#dm/${encodeURIComponent(dmId)}`;
        return;
    }

    // ── Report DM message button ──────────────────────────────────────────
    const reportDmMessageButton = target.closest('.report-dm-message-btn');
    if (reportDmMessageButton) {
        const dmId = String(reportDmMessageButton.dataset.dmId || '').trim();
        const messageId = String(reportDmMessageButton.dataset.messageId || '').trim();
        if (dmId && messageId && dmId.length <= 128 && messageId.length <= 128) {
            e.preventDefault();
            e.stopPropagation();
            openReportModal({
                targetKind: 'dm_message',
                targetId: `${dmId}:${messageId}`,
                targetLabel: 'このメッセージ',
            });
            reportDmMessageButton.closest('.post-menu')?.classList.remove('is-visible');
        }
        return;
    }

    // ── Code block copy button ─────────────────────────────────────────────
    const copyButton = target.closest('.copy-btn');
    if (copyButton) {
        e.stopPropagation();
        const parentPre = copyButton.closest('pre');
        const parentInlineWrapper = copyButton.closest('.inline-code-wrapper');
        let textToCopy = '';
        if (parentPre) {
            textToCopy = parentPre.querySelector('code')?.textContent || '';
        } else if (parentInlineWrapper) {
            textToCopy = parentInlineWrapper.querySelector('code')?.textContent || '';
        }
        if (textToCopy) {
            copyTextToClipboard(textToCopy)
                .then(() => {
                    const orig = copyButton.innerHTML;
                    copyButton.innerHTML = 'Copied!';
                    copyButton.style.minWidth = '50px';
                    setTimeout(() => {
                        copyButton.innerHTML = orig;
                        copyButton.style.minWidth = '';
                    }, 1500);
                })
                .catch(() => {
                    copyButton.innerHTML = 'Copy failed';
                });
        }
        return;
    }

    // ── Post context menu toggle ──────────────────────────────────────────
    const menuButton = target.closest('.post-menu-btn, .dm-message-menu-btn');
    if (menuButton) {
        e.stopPropagation();
        let menuToToggle;
        if (menuButton.classList.contains('dm-message-menu-btn')) {
            menuToToggle = menuButton
                .closest('.dm-message-container')
                ?.querySelector('.post-menu');
        } else {
            menuToToggle = menuButton
                .closest('.post-header')
                ?.querySelector('.post-menu');
        }
        if (menuToToggle) {
            const isCurrentlyVisible = menuToToggle.classList.contains('is-visible');
            document.querySelectorAll('.post-menu.is-visible').forEach((m) => m.classList.remove('is-visible'));
            if (!isCurrentlyVisible) {
                if (menuButton.classList.contains('dm-message-menu-btn')) {
                    positionDmMessageMenu(menuToToggle, menuButton);
                }
                menuToToggle.classList.add('is-visible');
            }
        }
        return;
    }

    // Close any open post-menu when clicking outside it.
    if (!target.closest('.post-menu')) {
        const openMenus = [...document.querySelectorAll('.post-menu.is-visible')];
        if (openMenus.length > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            openMenus.forEach((m) => m.classList.remove('is-visible'));
            return;
        }
    }

    // ── DM message edit / delete ──────────────────────────────────────────
    const dmEditBtn = target.closest('.edit-dm-msg-btn');
    if (dmEditBtn) {
        const container = dmEditBtn.closest('.dm-message-container');
        openDmEditModal(window.location.hash.substring(4), container.dataset.messageId);
        return;
    }
    const dmDeleteBtn = target.closest('.delete-dm-msg-btn');
    if (dmDeleteBtn) {
        const container = dmDeleteBtn.closest('.dm-message-container');
        handleDeleteDmMessage(
            window.location.hash.substring(4),
            container.dataset.messageId,
        );
        return;
    }

    // ── Post element actions ──────────────────────────────────────────────
    const postElement = target.closest('.post');
    if (postElement) {
        const timelinePostId = postElement.dataset.postId;
        const actionTargetPostId = postElement.dataset.actionTargetId || timelinePostId;

        if (target.closest('.share-btn')) {
            void copyPost(timelinePostId, target.closest('.share-btn'));
            return;
        }
        if (target.closest('.edit-btn')) {
            openEditPostModal(timelinePostId);
            return;
        }
        if (target.closest('.pin-btn')) {
            void pinPost(timelinePostId);
            return;
        }
        if (target.closest('.delete-btn')) {
            void deletePost(timelinePostId);
            return;
        }
        if (target.closest('.reply-button')) {
            const replyBtn = target.closest('.reply-button');
            handleReplyClick(
                actionTargetPostId,
                replyBtn.dataset.username,
                replyBtn.dataset.isPrivate === 'true',
            );
            return;
        }
        if (target.closest('.like-button')) {
            void handleLike(target.closest('.like-button'), actionTargetPostId);
            return;
        }
        if (target.closest('.star-button')) {
            void handleStar(target.closest('.star-button'), actionTargetPostId);
            return;
        }
        if (target.closest('.repost-button')) {
            const btn = target.closest('.repost-button');
            const post = btn._nyaitterPost || {
                id: actionTargetPostId,
                user: { id: null, name: '', icon_data: null },
                content: '',
            };
            openRepostModal(post, btn);
            return;
        }
        if (target.closest('.post-mask-alert')) {
            handleShowMaskedPost(target.closest('.post-mask-alert'));
            return;
        }
        // Navigate to post detail when clicking non-interactive area.
        if (
            !target.closest('a') &&
            !target.closest('.post-menu-btn') &&
            !target.closest('.attachment-item') &&
            !target.closest('.post-clamp-toggle')
        ) {
            window.location.hash = `#post/${actionTargetPostId}`;
            return;
        }
    }

    // ── Notification item ─────────────────────────────────────────────────
    // @メンションは通知本体のターゲットではなく、発信者プロフィールへ遷移する。
    if (target.closest('.notification-actor-link')) return;

    const notificationItem = target.closest('.notification-item');
    if (notificationItem) {
        const notificationId = notificationItem.dataset.notificationId;
        const notification = getCurrentUser()?.notice?.find(
            (n) => Number(n.id) === Number(notificationId),
        );

        // 削除ボタン
        if (target.closest('.notification-delete-btn')) {
            e.stopPropagation();
            const wasUnread = Boolean(notification && !notification.read);
            api.rpc('delete_notification', {
                target_user_id: getCurrentUser().id,
                notification_id_to_delete: notificationId,
            }).then(({ error }) => {
                if (error) {
                    console.error('通知の削除に失敗:', error);
                    showAppAlert('通知の削除に失敗しました。');
                } else {
                    getCurrentUser().notice = getCurrentUser().notice.filter(
                        (n) => n.id !== notificationId,
                    );
                    if (wasUnread) {
                        getCurrentUser().notification_unread_count = Math.max(
                            0,
                            Number(getCurrentUser().notification_unread_count || 0) - 1,
                        );
                    }
                    notificationItem.remove();
                    void updateNavAndSidebars();
                }
            });
            return;
        }

        // クリック済み状態
        if (notification && !notification.clicked) {
            api.rpc('mark_notification_as_clicked', {
                notification_id_to_update: notificationId,
            }).then(({ error }) => {
                if (!error) {
                    notification.clicked = true;
                    notificationItem.classList.remove('notification-new');
                    notificationItem.classList.add('notification-clicked');
                    notificationItem.dataset.notificationClicked = 'true';
                }
            });
        }
        if (notification) {
            window.location.hash = getNotificationTargetHash(notification);
        }
        return;
    }

    // ── Timeline tab buttons ──────────────────────────────────────────────
    const timelineTab = target.closest('.timeline-tab-button');
    if (timelineTab) {
        clearRealtimeTimelineUpdate();
        void switchTimelineTab(timelineTab.dataset.tab, {
            forceRefresh: true,
            resetScroll: true,
        });
        return;
    }

    // ── Guest banner buttons ──────────────────────────────────────────────
    if (target.closest('#banner-signup-button') || target.closest('#banner-login-button')) {
        goToLoginPage();
        return;
    }
}

/**
 * events.js
 * Global delegated event handlers for click, keydown, submit, hashchange, etc.
 * All event listeners are attached once at app startup to avoid memory leaks.
 */

import { api, apiRequest } from './api.js';
import { DOM, openImageModal, closeImageModal } from './dom.js';
import { getCurrentUser, getCurrentTimelineTab, getActiveDmId } from './state.js';
import { router } from './router.js';
import { clearRealtimeTimelineUpdate } from './modules/cache.js';
import { switchTimelineTab } from './screens/timelineScreen.js';
import { openCreateDmModal } from './screens/dmScreen.js';
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
    handleDislikePost,
    handleFollowMenuToggle,
    handleBlockMenuToggle,
    openReplyControlModal,
} from './modules/posts.js';
import {
    openDmEditModal,
    openDmManageModal,
    handleDeleteDmMessage,
    positionDmMessageMenu,
} from './modules/dm.js';
import { getNotificationTargetHash } from './modules/notifications.js';
import { updateNavAndSidebars } from './modules/sidebar.js';
import { beginScrollRouteTransition, saveScrollPosition } from './modules/scroll.js';
import { goToLoginPage } from './modules/auth.js';
import { setupTabSwipeNavigation } from './modules/tabSwipe.js';
import {
    getSafeHttpUrl,
    copyTextToClipboard,
    showAppAlert,
} from './utils/helpers.js';
import { positionElementRelativeToAnchor } from './utils/viewport.js';

/**
 * Attach all global delegated event listeners.
 * Call this once from initApp().
 */
let lastPointerDownTarget = null;
let lastPointerDownTime = 0;
let lastPointerDownPos = { x: 0, y: 0 };

function adjustPostMenuPosition(menu) {
    if (!menu) return;
    menu.style.top = '';
    menu.style.bottom = '';
    menu.style.left = '';
    menu.style.right = '';
    menu.classList.add('is-visible');

    const rect = menu.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 640;
    const margin = 8;

    // 画面下端にはみ出る場合は上側に反転表示
    if (rect.bottom > vh - margin) {
        menu.style.top = 'auto';
        menu.style.bottom = '25px';
    }

    // 画面左端にはみ出る場合は左揃えに調整
    const updatedRect = menu.getBoundingClientRect();
    if (updatedRect.left < margin) {
        menu.style.right = 'auto';
        menu.style.left = '0';
    }
}

export function setupGlobalEventListeners() {
    // ---- Pointerdown / mousedown handler to track click start target ----
    document.addEventListener('pointerdown', (e) => {
        lastPointerDownTarget = e.target;
        lastPointerDownTime = Date.now();
        lastPointerDownPos = { x: e.clientX, y: e.clientY };
    }, { passive: true });

    // ---- Global fallback for broken/failed user avatar images ----
    document.addEventListener(
        'error',
        (event) => {
            const target = event.target;
            if (target instanceof HTMLImageElement) {
                const isUserAvatar =
                    target.classList.contains('user-icon') ||
                    target.classList.contains('user-icon-large') ||
                    target.classList.contains('dm-list-item-avatar') ||
                    target.classList.contains('dm-message-icon') ||
                    target.classList.contains('dm-search-user-icon') ||
                    target.classList.contains('dm-manage-member-icon') ||
                    target.classList.contains('switcher-user-icon') ||
                    target.classList.contains('nyauth-account-avatar') ||
                    target.classList.contains('post-account-menu-icon') ||
                    target.id === 'setting-icon-preview';
                if (isUserAvatar && !target.src.endsWith('/emoji/neko.svg')) {
                    target.src = '/emoji/neko.svg';
                }
            }
        },
        true,
    );

    // ---- Click handler ----
    document.addEventListener('click', handleGlobalClick);

    // ---- Touch swipe for tabs navigation (Home & Profile) ----
    setupTabSwipeNavigation();

    // ---- 「再試行」ボタン ----
    DOM.retryConnectionBtn?.addEventListener('click', async () => {
        DOM.connectionErrorOverlay?.classList.add('hidden');
        globalThis.__nyaitterStatusPromise = null;
        const { loadServerClientLimits } = await import('./app.js');
        if (!(await loadServerClientLimits())) return;
        const { checkSession } = await import('./modules/auth.js');
        void checkSession();
    });

    // ---- hashchange → router ----
    window.addEventListener('hashchange', router);

    // ---- Image modal close & spoiler keyboard toggle ----
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeImageModal();
            document.getElementById('report-modal')?.classList.add('hidden');
            return;
        }
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('markdown-spoiler')) {
            e.preventDefault();
            e.stopPropagation();
            const spoiler = e.target;
            const isRevealed = spoiler.classList.toggle('is-revealed');
            spoiler.setAttribute('aria-expanded', isRevealed ? 'true' : 'false');
            const spoilerContent = spoiler.querySelector('.markdown-spoiler-content');
            if (spoilerContent) {
                spoilerContent.setAttribute('aria-hidden', isRevealed ? 'false' : 'true');
            }
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
        void switchTimelineTab('following', {
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
        openCreateDmModal();
        return;
    }

    if (action === 'open-dm-manage') {
        const dmId = String(actionTarget.dataset.dmId || '').trim();
        if (dmId && dmId.length <= 128) {
            e.preventDefault();
            e.stopPropagation();
            void openDmManageModal(dmId);
        }
        return;
    }

    if (action === 'open-image') {
        const imageUrl = getSafeHttpUrl(actionTarget.dataset.url);
        if (imageUrl) {
            e.preventDefault();
            e.stopPropagation();

            const parentContainer = actionTarget.closest('.attachments-container, .post-attachments, .dm-attachments, .post, .dm-message-container');
            let allImages = [];
            let imageIndex = 0;
            if (parentContainer) {
                const imageEls = Array.from(parentContainer.querySelectorAll('[data-action="open-image"], .attachment-image'));
                allImages = imageEls.map((el) => getSafeHttpUrl(el.dataset?.url || el.src)).filter(Boolean);
                imageIndex = imageEls.indexOf(actionTarget);
                if (imageIndex < 0) imageIndex = 0;
            }
            if (allImages.length <= 1) {
                allImages = [imageUrl];
                imageIndex = 0;
            }

            openImageModal(imageUrl, { images: allImages, index: imageIndex });
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
            document.querySelectorAll('.post-menu.is-visible').forEach((m) => {
                m.classList.remove('is-visible');
                m.style.top = '';
                m.style.bottom = '';
                m.style.left = '';
                m.style.right = '';
            });
            if (!isCurrentlyVisible) {
                if (menuButton.classList.contains('dm-message-menu-btn')) {
                    positionDmMessageMenu(menuToToggle, menuButton);
                } else {
                    adjustPostMenuPosition(menuToToggle);
                }
            }
        }
        return;
    }

    // Close any open post-menu when clicking outside it.
    if (!target.closest('.post-menu')) {
        const openMenus = [...document.querySelectorAll('.post-menu.is-visible')];
        if (openMenus.length > 0) {
            openMenus.forEach((m) => {
                m.classList.remove('is-visible');
                m.style.top = '';
                m.style.bottom = '';
                m.style.left = '';
                m.style.right = '';
            });
            return;
        }
    }

    // ── DM message edit / delete ──────────────────────────────────────────
    const dmEditBtn = target.closest('.edit-dm-msg-btn');
    if (dmEditBtn) {
        const container = dmEditBtn.closest('.dm-message-container');
        const activeHash = window.location.hash || '';
        const dmId = activeHash.startsWith('#dm/') ? decodeURIComponent(activeHash.substring(4)) : getActiveDmId();
        if (dmId && container?.dataset.messageId) {
            import('./screens/dmScreen.js').then(({ showDmConversation }) => {
                openDmEditModal(dmId, container.dataset.messageId, async () => {
                    await showDmConversation(dmId);
                });
            });
        }
        return;
    }
    const dmDeleteBtn = target.closest('.delete-dm-msg-btn');
    if (dmDeleteBtn) {
        const container = dmDeleteBtn.closest('.dm-message-container');
        const activeHash = window.location.hash || '';
        const dmId = activeHash.startsWith('#dm/') ? decodeURIComponent(activeHash.substring(4)) : getActiveDmId();
        if (dmId && container?.dataset.messageId) {
            handleDeleteDmMessage(dmId, container.dataset.messageId, () => {
                container.remove();
            });
        }
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
        if (target.closest('.activity-btn')) {
            target.closest('.post-menu')?.classList.remove('is-visible');
            const targetId = Number(actionTargetPostId || timelinePostId);
            if (targetId) {
                window.location.hash = `#post/${targetId}/activity`;
            }
            return;
        }
        if (target.closest('.dislike-btn')) {
            void handleDislikePost(actionTargetPostId || timelinePostId, target.closest('.post-menu'));
            return;
        }
        if (target.closest('.follow-menu-btn')) {
            const author = postElement._displayAuthor || postElement._nyaitterPost?.author || postElement._nyaitterPost?.user;
            void handleFollowMenuToggle(author, target.closest('.post-menu'));
            return;
        }
        if (target.closest('.block-menu-btn')) {
            const author = postElement._displayAuthor || postElement._nyaitterPost?.author || postElement._nyaitterPost?.user;
            void handleBlockMenuToggle(author, target.closest('.post-menu'));
            return;
        }
        if (target.closest('.reply-control-menu-btn')) {
            const post = postElement._nyaitterPost || { id: Number(timelinePostId) };
            openReplyControlModal(post);
            target.closest('.post-menu')?.classList.remove('is-visible');
            return;
        }
        if (target.closest('.report-btn')) {
            openReportModal({
                targetKind: 'post',
                targetId: Number(actionTargetPostId || timelinePostId),
                targetLabel: 'このポスト',
            });
            target.closest('.post-menu')?.classList.remove('is-visible');
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
            if (replyBtn.disabled || replyBtn.classList.contains('disabled')) {
                return;
            }
            const replyPost = replyBtn._nyaitterPost;
            const replyAuthor = replyPost?.author || replyPost?.user;
            handleReplyClick(
                actionTargetPostId,
                replyAuthor?.name || replyBtn.dataset.username || '',
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

        // ── Markdown spoiler interaction ──────────────────────────────────
        const spoiler = target.closest('.markdown-spoiler');
        if (spoiler) {
            e.preventDefault();
            e.stopPropagation();
            const isRevealed = spoiler.classList.toggle('is-revealed');
            spoiler.setAttribute('aria-expanded', isRevealed ? 'true' : 'false');
            const spoilerContent = spoiler.querySelector('.markdown-spoiler-content');
            if (spoilerContent) {
                spoilerContent.setAttribute('aria-hidden', isRevealed ? 'false' : 'true');
            }
            return;
        }

        // テキスト選択や長押しドラッグされた場合は、詳細画面遷移を阻止する。
        const selection = window.getSelection();
        const hasTextSelection = Boolean(selection && !selection.isCollapsed && selection.toString().trim());
        const pressDuration = Date.now() - (lastPointerDownTime || 0);
        const isLongPress = lastPointerDownTime > 0 && pressDuration > 500;
        const dragDistance = Math.hypot(
            e.clientX - (lastPointerDownPos.x || e.clientX),
            e.clientY - (lastPointerDownPos.y || e.clientY),
        );
        const isDrag = dragDistance > 10;

        if (hasTextSelection || isLongPress || isDrag) {
            return;
        }

        // インタラクティブな要素（リンク、ボタン、添付ファイル、メニュー等）以外をクリックした場合は
        // 詳細画面へ遷移
        if (
            !target.closest('a') &&
            !target.closest('button') &&
            !target.closest('.post-menu-btn') &&
            !target.closest('.attachment-item') &&
            !target.closest('.attachments-container') &&
            !target.closest('.post-poll-container') &&
            !target.closest('.nested-repost-container') &&
            !target.closest('.post-clamp-toggle') &&
            !target.closest('.post-action-btn') &&
            !target.closest('.custom-emoji-btn') &&
            !target.closest('.markdown-spoiler') &&
            !target.closest('input, textarea, select, label')
        ) {
            saveScrollPosition();
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
                        (n) => Number(n.id) !== Number(notificationId),
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
        const isCurrentActive = timelineTab.classList.contains('active') || timelineTab.dataset.tab === getCurrentTimelineTab();
        clearRealtimeTimelineUpdate();
        void switchTimelineTab(timelineTab.dataset.tab, {
            forceRefresh: isCurrentActive,
            resetScroll: isCurrentActive,
        });
        return;
    }

    // ── Guest banner buttons ──────────────────────────────────────────────
    if (target.closest('#banner-signup-button') || target.closest('#banner-login-button')) {
        goToLoginPage();
        return;
    }
}

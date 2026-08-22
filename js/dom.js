import { getSafeHttpUrl } from './utils/helpers.js';

export const DOM = {
    mainContent: document.getElementById('main-content'),
    navMenuTop: document.getElementById('nav-menu-top'),
    navMenuBottom: document.getElementById('nav-menu-bottom'),
    navLogo: document.getElementById('nav-logo'),
    pageHeader: document.getElementById('page-header'),
    screens: document.querySelectorAll('.screen'),
    postFormContainer: document.querySelector('.post-form-container'),
    postModal: document.getElementById('post-modal'),
    editPostModal: document.getElementById('edit-post-modal'),
    editPostModalContent: document.getElementById('edit-post-modal-content'),
    createDmModal: document.getElementById('create-dm-modal'),
    createDmModalContent: document.getElementById('create-dm-modal-content'),
    dmManageModal: document.getElementById('dm-manage-modal'),
    dmManageModalContent: document.getElementById('dm-manage-modal-content'),
    editDmMessageModal: document.getElementById('edit-dm-message-modal'),
    editDmMessageModalContent: document.getElementById(
        'edit-dm-message-modal-content',
    ),
    connectionErrorOverlay: document.getElementById('connection-error-overlay'),
    retryConnectionBtn: document.getElementById('retry-connection-btn'),
    freezeOverlay: document.getElementById('freeze-overlay'),
    freezeReason: document.getElementById('freeze-reason'),
    imagePreviewModal: document.getElementById('image-preview-modal'),
    imagePreviewModalContent: document.getElementById(
        'image-preview-modal-content',
    ),
    timeline: document.getElementById('timeline'),
    exploreContent: document.getElementById('explore-content'),
    notificationsContent: document.getElementById('notifications-content'),
    likesContent: document.getElementById('likes-content'),
    starsContent: document.getElementById('stars-content'),
    postDetailContent: document.getElementById('post-detail-content'),
    searchResultsScreen: document.getElementById('search-results-screen'),
    searchResultsContent: document.getElementById('search-results-content'),
    ruleScreen: document.getElementById('rule-screen'),
    ruleContent: document.getElementById('rule-content'),
    nyaitterAuthScreen: document.getElementById('nyaitter-auth-screen'),
    nyaitterAuthContent: document.getElementById('nyaitter-auth-content'),
    dmScreen: document.getElementById('dm-screen'),
    dmContent: document.getElementById('dm-content'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loginBanner: document.getElementById('login-banner'),
    rightSidebar: {
        recommendations: document.getElementById(
            'recommendations-widget-container',
        ),
        searchWidget: document.getElementById(
            'right-sidebar-search-widget-container',
        ),
        links: document.getElementById('right-sidebar-links-container'),
    },
};

let imageModalOpen = false;

export function openImageModal(sourceUrl) {
    const safeUrl = getSafeHttpUrl(sourceUrl);
    if (!safeUrl || !DOM.imagePreviewModal || !DOM.imagePreviewModalContent) {
        return false;
    }
    DOM.imagePreviewModalContent.src = safeUrl;
    DOM.imagePreviewModal.classList.remove('hidden');

    if (!imageModalOpen) {
        imageModalOpen = true;
        try {
            history.pushState({ modal: 'image-preview' }, '');
        } catch (_) {}
    }
    return true;
}

export function closeImageModal({ fromHistory = false } = {}) {
    if (!DOM.imagePreviewModal || !DOM.imagePreviewModalContent) return;
    DOM.imagePreviewModal.classList.add('hidden');
    DOM.imagePreviewModalContent.removeAttribute('src');

    if (imageModalOpen) {
        imageModalOpen = false;
        if (!fromHistory) {
            try {
                if (history.state?.modal === 'image-preview') {
                    history.back();
                }
            } catch (_) {}
        }
    }
}

export function showMainJsError(message) {
    const overlay = document.getElementById('mainjs-error-overlay');
    const text = document.getElementById('mainjs-error-text');
    if (!overlay || !text) return;
    text.textContent = String(message || '不明なエラー').slice(0, 2000);
    overlay.classList.remove('hidden');
}

window.addEventListener('error', (event) => {
    showMainJsError(`JavaScriptエラー: ${event.message || '不明なエラー'}`);
});
window.addEventListener('unhandledrejection', (event) => {
    const reason =
        event.reason instanceof Error
            ? event.reason.message
            : String(event.reason || '不明なエラー');
    // 詳細は画面へ露出させず、運用者がブラウザコンソールで原因を調査できるようにする。
    console.error('[nyaitter] Unhandled promise rejection:', event.reason);
    showMainJsError(`未処理のPromise例外: ${reason}`);
});
document
    .getElementById('mainjs-error-reload-btn')
    ?.addEventListener('click', () => window.location.reload());

// 画像以外の領域（背景、余白、閉じるボタン等）をクリックした時に閉じる
DOM.imagePreviewModal?.addEventListener('click', (event) => {
    if (event.target !== DOM.imagePreviewModalContent) {
        event.preventDefault();
        event.stopPropagation();
        closeImageModal();
    }
});

// ブラウザの戻る操作で閉じる
window.addEventListener('popstate', (event) => {
    if (imageModalOpen) {
        closeImageModal({ fromHistory: true });
    }
});

// Escapeキーで閉じる
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && imageModalOpen) {
        closeImageModal();
    }
});

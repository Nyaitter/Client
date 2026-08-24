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
let currentImageModalList = [];
let currentImageModalIndex = 0;
let imageModalListenersAttached = false;

function renderImageModalCurrent() {
    if (!DOM.imagePreviewModalContent || currentImageModalList.length === 0) return;
    const url = currentImageModalList[currentImageModalIndex];
    DOM.imagePreviewModalContent.src = url;

    if (DOM.imagePreviewModal) {
        const prevBtn = DOM.imagePreviewModal.querySelector('.image-modal-prev-btn');
        const nextBtn = DOM.imagePreviewModal.querySelector('.image-modal-next-btn');
        const counter = DOM.imagePreviewModal.querySelector('.image-modal-counter');
        const hasMultiple = currentImageModalList.length > 1;

        if (prevBtn) {
            prevBtn.classList.toggle('hidden', !hasMultiple || currentImageModalIndex <= 0);
        }
        if (nextBtn) {
            nextBtn.classList.toggle('hidden', !hasMultiple || currentImageModalIndex >= currentImageModalList.length - 1);
        }
        if (counter) {
            if (hasMultiple) {
                counter.textContent = `${currentImageModalIndex + 1} / ${currentImageModalList.length}`;
                counter.classList.remove('hidden');
            } else {
                counter.classList.add('hidden');
            }
        }
    }
}

export function showPrevModalImage() {
    if (currentImageModalIndex > 0) {
        currentImageModalIndex--;
        renderImageModalCurrent();
    }
}

export function showNextModalImage() {
    if (currentImageModalIndex < currentImageModalList.length - 1) {
        currentImageModalIndex++;
        renderImageModalCurrent();
    }
}

function attachImageModalListeners() {
    if (imageModalListenersAttached || !DOM.imagePreviewModal) return;
    imageModalListenersAttached = true;

    // 画像外の背景をクリックしたときに閉じる
    DOM.imagePreviewModal.addEventListener('click', (e) => {
        if (e.target.closest('.image-modal-nav-btn') || e.target.closest('.modal-close-btn')) return;
        const img = DOM.imagePreviewModalContent;
        if (e.target === img && img?.naturalWidth && img?.naturalHeight) {
            const rect = img.getBoundingClientRect();
            const imgRatio = img.naturalWidth / img.naturalHeight;
            const containerRatio = rect.width / rect.height;
            let renderedWidth, renderedHeight, offsetX, offsetY;
            if (containerRatio > imgRatio) {
                renderedHeight = rect.height;
                renderedWidth = rect.height * imgRatio;
                offsetX = (rect.width - renderedWidth) / 2;
                offsetY = 0;
            } else {
                renderedWidth = rect.width;
                renderedHeight = rect.width / imgRatio;
                offsetX = 0;
                offsetY = (rect.height - renderedHeight) / 2;
            }
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const isInsideImage =
                clickX >= offsetX &&
                clickX <= offsetX + renderedWidth &&
                clickY >= offsetY &&
                clickY <= offsetY + renderedHeight;
            if (isInsideImage) return;
        }
        closeImageModal();
    });

    // 閉じるボタン
    const closeBtn = DOM.imagePreviewModal.querySelector('.modal-close-btn');
    closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeImageModal();
    });

    // 左右ボタン
    const prevBtn = DOM.imagePreviewModal.querySelector('.image-modal-prev-btn');
    const nextBtn = DOM.imagePreviewModal.querySelector('.image-modal-next-btn');
    prevBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        showPrevModalImage();
    });
    nextBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        showNextModalImage();
    });

    // スワイプ操作 (タッチ)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    DOM.imagePreviewModal.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
        }
    }, { passive: true });

    DOM.imagePreviewModal.addEventListener('touchend', (e) => {
        if (e.changedTouches.length === 1 && currentImageModalList.length > 1) {
            const deltaX = e.changedTouches[0].clientX - touchStartX;
            const deltaY = e.changedTouches[0].clientY - touchStartY;
            const deltaTime = Date.now() - touchStartTime;

            if (deltaTime < 500 && Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
                if (deltaX > 0) {
                    showPrevModalImage();
                } else {
                    showNextModalImage();
                }
            }
        }
    }, { passive: true });

    // キーボード操作
    window.addEventListener('keydown', (e) => {
        if (!imageModalOpen) return;
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            showPrevModalImage();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            showNextModalImage();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeImageModal();
        }
    });
}

export function openImageModal(sourceUrl, options = {}) {
    let images = [];
    let initialIndex = 0;

    if (Array.isArray(options.images) && options.images.length > 0) {
        images = options.images.map(getSafeHttpUrl).filter(Boolean);
        initialIndex = Number.isInteger(options.index) ? options.index : 0;
    } else if (Array.isArray(sourceUrl)) {
        images = sourceUrl.map(getSafeHttpUrl).filter(Boolean);
        initialIndex = Number.isInteger(options.index) ? options.index : 0;
    } else {
        const safeUrl = getSafeHttpUrl(sourceUrl);
        if (safeUrl) images = [safeUrl];
    }

    if (images.length === 0 || !DOM.imagePreviewModal || !DOM.imagePreviewModalContent) {
        return false;
    }

    currentImageModalList = images;
    currentImageModalIndex = Math.max(0, Math.min(initialIndex, images.length - 1));

    attachImageModalListeners();
    renderImageModalCurrent();
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
    currentImageModalList = [];
    currentImageModalIndex = 0;

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

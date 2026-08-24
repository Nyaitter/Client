/**
 * Viewport Observer Utility
 * Uses IntersectionObserver when available, with a requestAnimationFrame fallback.
 */
export function createViewportObserver(callback, options = {}) {
    if (typeof IntersectionObserver === 'function') {
        return new IntersectionObserver(callback, options);
    }

    let target = null;
    let scheduled = false;
    const rootMargin = Number.parseInt(options.rootMargin, 10) || 0;
    const requestFrame =
        window.requestAnimationFrame || ((handler) => setTimeout(handler, 0));
    const checkIntersection = () => {
        scheduled = false;
        if (!target || !document.documentElement.contains(target)) return;
        const bounds = target.getBoundingClientRect();
        const viewportHeight =
            window.innerHeight || document.documentElement.clientHeight || 0;
        const isIntersecting =
            bounds.top <= viewportHeight + rootMargin &&
            bounds.bottom >= -rootMargin;
        callback([{ target, isIntersecting }]);
    };
    const scheduleCheck = () => {
        if (scheduled) return;
        scheduled = true;
        requestFrame(checkIntersection);
    };
    const onViewportChange = () => scheduleCheck();

    return {
        observe(element) {
            target = element;
            window.addEventListener('scroll', onViewportChange, { passive: true });
            window.addEventListener('resize', onViewportChange, { passive: true });
            scheduleCheck();
        },
        unobserve(element) {
            if (target === element) target = null;
        },
        disconnect() {
            target = null;
            window.removeEventListener('scroll', onViewportChange);
            window.removeEventListener('resize', onViewportChange);
        },
    };
}

/**
 * 任意の要素（ポップアップ、メニュー、ダイアログ等）がビューポート（画面）外にはみ出ないように
 * 位置（left / top または transform / margin）および最大サイズを自動調整・クランプする。
 */
export function clampElementToViewport(element, { margin = 8, useFixed = false } = {}) {
    if (!element || !element.isConnected) return;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 360;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 640;
    const maxAllowedWidth = Math.max(120, viewportWidth - margin * 2);
    const maxAllowedHeight = Math.max(120, viewportHeight - margin * 2);

    element.style.maxWidth = `${maxAllowedWidth}px`;
    element.style.maxHeight = `${maxAllowedHeight}px`;

    const rect = element.getBoundingClientRect();
    const scrollX = useFixed ? 0 : (window.scrollX || window.pageXOffset || 0);
    const scrollY = useFixed ? 0 : (window.scrollY || window.pageYOffset || 0);

    // 要素が absolute の場合、現在の left / top 数値を取得
    const computedStyle = window.getComputedStyle(element);
    let currentLeft = Number.parseFloat(computedStyle.left) || rect.left + scrollX;
    let currentTop = Number.parseFloat(computedStyle.top) || rect.top + scrollY;

    // 水平方向のはみ出し調整
    if (rect.right > viewportWidth - margin) {
        const overflowX = rect.right - (viewportWidth - margin);
        currentLeft -= overflowX;
    }
    if (rect.left - (rect.right > viewportWidth - margin ? rect.right - (viewportWidth - margin) : 0) < margin) {
        currentLeft = scrollX + margin;
    }

    // 垂直方向のはみ出し調整
    if (rect.bottom > viewportHeight - margin) {
        const overflowY = rect.bottom - (viewportHeight - margin);
        currentTop -= overflowY;
    }
    if (rect.top - (rect.bottom > viewportHeight - margin ? rect.bottom - (viewportHeight - margin) : 0) < margin) {
        currentTop = scrollY + margin;
    }

    element.style.left = `${Math.round(currentLeft)}px`;
    element.style.top = `${Math.round(currentTop)}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
}

/**
 * トリガー要素（ボタン等）に相対してメニューを画面内に配置する。
 * 上下左右の反転と画面外へのクランプを自動で行う。
 */
export function positionElementRelativeToAnchor(
    element,
    anchor,
    {
        placement = 'bottom-end', // 'bottom-end' | 'bottom-start' | 'top-end' | 'top-start'
        margin = 8,
        gap = 6,
        useFixed = false,
    } = {},
) {
    if (!element || !anchor) return;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 360;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 640;
    const scrollX = useFixed ? 0 : (window.scrollX || window.pageXOffset || 0);
    const scrollY = useFixed ? 0 : (window.scrollY || window.pageYOffset || 0);

    const maxAllowedWidth = Math.max(120, viewportWidth - margin * 2);
    const maxAllowedHeight = Math.max(120, viewportHeight - margin * 2);

    element.style.maxWidth = `${maxAllowedWidth}px`;
    element.style.maxHeight = `${maxAllowedHeight}px`;
    element.style.position = useFixed ? 'fixed' : 'absolute';

    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = element.getBoundingClientRect();
    const menuWidth = menuRect.width || element.offsetWidth || 180;
    const menuHeight = menuRect.height || element.offsetHeight || 120;

    // 垂直方向の計算（下に収まらなければ上に反転、上に収まらなければ下に反転）
    let top;
    const preferTop = placement.startsWith('top');
    const spaceBelow = viewportHeight - anchorRect.bottom - gap - margin;
    const spaceAbove = anchorRect.top - gap - margin;

    if (preferTop) {
        if (spaceAbove >= menuHeight || spaceAbove >= spaceBelow) {
            top = anchorRect.top - menuHeight - gap;
        } else {
            top = anchorRect.bottom + gap;
        }
    } else {
        if (spaceBelow >= menuHeight || spaceBelow >= spaceAbove) {
            top = anchorRect.bottom + gap;
        } else {
            top = anchorRect.top - menuHeight - gap;
        }
    }

    // 水平方向の計算（右揃え・左揃えと反転）
    let left;
    const preferEnd = placement.endsWith('end');
    if (preferEnd) {
        left = anchorRect.right - menuWidth;
        if (left < margin) {
            left = anchorRect.left;
        }
    } else {
        left = anchorRect.left;
        if (left + menuWidth > viewportWidth - margin) {
            left = anchorRect.right - menuWidth;
        }
    }

    // ビューポート内にクランプ
    const clampedTop = Math.max(margin, Math.min(top, viewportHeight - menuHeight - margin));
    const clampedLeft = Math.max(margin, Math.min(left, viewportWidth - menuWidth - margin));

    element.style.top = `${Math.round(scrollY + clampedTop)}px`;
    element.style.left = `${Math.round(scrollX + clampedLeft)}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
}


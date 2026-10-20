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
 * トリガー要素に相対してメニューを画面内に配置する。
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

    const clampedTop = Math.max(margin, Math.min(top, viewportHeight - menuHeight - margin));
    const clampedLeft = Math.max(margin, Math.min(left, viewportWidth - menuWidth - margin));

    element.style.top = `${Math.round(scrollY + clampedTop)}px`;
    element.style.left = `${Math.round(scrollX + clampedLeft)}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
}


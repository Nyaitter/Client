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

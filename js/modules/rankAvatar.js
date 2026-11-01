import { getRankAppearance } from './rankAppearance.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const instances = new WeakMap();
let nextId = 0;

const RING = 'M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z';

function portalScale(element) {
    if (typeof element.currentCSSZoom === 'number') return element.currentCSSZoom || 1;
    let scale = 1;
    for (let node = element; node; node = node.parentElement) {
        const zoom = element.ownerDocument.defaultView.getComputedStyle(node).zoom;
        const value = parseFloat(zoom);
        if (Number.isFinite(value) && value > 0) scale *= zoom.endsWith('%') ? value / 100 : value;
    }
    return scale;
}

// ランク取得や本人判定は呼出元で行い、公開してよいIDだけを渡す。
export function attachRankAvatar(image, options = {}) {
    if (!image || image.tagName !== 'IMG') throw new TypeError('アバター画像が必要です。');
    const previous = instances.get(image);
    if (previous) {
        previous.update(options);
        return previous;
    }

    const document = image.ownerDocument;
    const window = document.defaultView;
    let settings = { enabled: false, isSelf: true, ranks: null, focusTarget: null, ...options };
    let layer = null;
    let tooltip = null;
    let panel = null;
    let trigger = null;
    let observer = null;
    let controller = null;
    let frame = 0;
    let tooltipTimer = 0;
    let destroyed = false;
    let entries = [];
    let paths = [];
    const id = `rank-avatar-${++nextId}`;

    const focusImage = () => {
        const target = settings.focusTarget || image.closest('a[href], button, [tabindex]') || image;
        if (!target?.isConnected || typeof target.focus !== 'function') return;
        const temporary = !target.hasAttribute('tabindex') && target.tabIndex < 0;
        if (temporary) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        if (temporary) target.removeAttribute('tabindex');
    };

    const hideTooltip = () => {
        window.clearTimeout(tooltipTimer);
        if (tooltip) tooltip.hidden = true;
        for (const path of paths) path.removeAttribute('aria-describedby');
    };

    const deferHideTooltip = () => {
        window.clearTimeout(tooltipTimer);
        tooltipTimer = window.setTimeout(hideTooltip, 150);
    };

    const positionPopup = popup => {
        if (!popup || popup.hidden || !layer) return;
        const rect = image.getBoundingClientRect();
        const bounds = popup.getBoundingClientRect();
        const viewport = window.visualViewport;
        const left = viewport?.offsetLeft || 0;
        const top = viewport?.offsetTop || 0;
        const width = viewport?.width || window.innerWidth;
        const height = viewport?.height || window.innerHeight;
        const scale = portalScale(popup);
        popup.style.zIndex = String(Math.max(2100, Number(layer.style.zIndex) + 1));
        popup.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - bounds.width - 8)) / scale}px`;
        const below = rect.bottom + 10;
        popup.style.top = `${Math.max(top + 8, Math.min(below + bounds.height <= top + height - 8 ? below : rect.top - bounds.height - 10, top + height - bounds.height - 8)) / scale}px`;
    };

    const closePanel = (restoreFocus = false) => {
        if (!panel) return;
        const oldTrigger = trigger;
        panel.remove();
        panel = null;
        trigger = null;
        for (const path of paths) path.setAttribute('aria-expanded', 'false');
        if (restoreFocus) {
            if (oldTrigger?.isConnected) oldTrigger.focus({ preventScroll: true });
            else focusImage();
        }
    };

    const showTooltip = (path, entry) => {
        if (panel || !tooltip || layer.hidden) return;
        hideTooltip();
        tooltip.textContent = entry.label;
        tooltip.hidden = false;
        path.setAttribute('aria-describedby', tooltip.id);
        positionPopup(tooltip);
    };

    const openPanel = path => {
        if (panel) {
            closePanel(true);
            return;
        }
        hideTooltip();
        trigger = path;
        panel = document.createElement('div');
        panel.className = 'rank-avatar-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', typeof settings.label === 'string' ? `${settings.label}の情報` : '表示ランクの情報');
        const list = document.createElement('ul');
        for (const entry of entries) {
            const item = document.createElement('li');
            item.textContent = entry.label;
            list.append(item);
        }
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '閉じる';
        close.addEventListener('click', () => closePanel(true));
        panel.append(list, close);
        document.body.append(panel);
        path.setAttribute('aria-expanded', 'true');
        positionPopup(panel);
        close.focus({ preventScroll: true });
    };

    const refresh = () => {
        if (!layer) return;
        const rect = image.getBoundingClientRect();
        const scale = portalScale(layer);
        const style = window.getComputedStyle(image);
        let outerZ = null;
        const clip = { left: rect.left - 8, top: rect.top - 8, right: rect.right + 8, bottom: rect.bottom + 8 };
        for (let parent = image.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const parentStyle = window.getComputedStyle(parent);
            const z = Number.parseInt(parentStyle.zIndex, 10);
            if (Number.isFinite(z) || ['fixed', 'sticky'].includes(parentStyle.position) ||
                parentStyle.transform !== 'none' || parentStyle.filter !== 'none' ||
                parentStyle.isolation === 'isolate' || Number(parentStyle.opacity) < 1 ||
                /paint|layout|strict|content/.test(parentStyle.contain)) outerZ = Number.isFinite(z) ? z : 0;
            if (parent === settings.unclippedFrame) continue;
            const clipsX = /hidden|clip|auto|scroll/.test(parentStyle.overflowX);
            const clipsY = /hidden|clip|auto|scroll/.test(parentStyle.overflowY);
            if (!clipsX && !clipsY) continue;
            const bounds = parent.getBoundingClientRect();
            const scaleX = bounds.width / parent.offsetWidth || 1;
            const scaleY = bounds.height / parent.offsetHeight || 1;
            if (clipsX) {
                clip.left = Math.max(clip.left, bounds.left + parent.clientLeft * scaleX);
                clip.right = Math.min(clip.right, bounds.left + (parent.clientLeft + parent.clientWidth) * scaleX);
            }
            if (clipsY) {
                clip.top = Math.max(clip.top, bounds.top + parent.clientTop * scaleY);
                clip.bottom = Math.min(clip.bottom, bounds.top + (parent.clientTop + parent.clientHeight) * scaleY);
            }
        }
        const hidden = !image.isConnected || !image.getClientRects().length || rect.width <= 0 || rect.height <= 0 ||
            style.visibility !== 'visible' || (image.checkVisibility && !image.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) ||
            clip.right <= clip.left || clip.bottom <= clip.top ||
            rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth;
        layer.hidden = hidden;
        if (hidden) {
            hideTooltip();
            const focused = panel?.contains(document.activeElement) || layer.contains(document.activeElement);
            closePanel();
            if (focused) focusImage();
            return;
        }
        const holes = (settings.occluders || []).filter(element => element.isConnected && element.getClientRects().length).map(element => {
            const bounds = element.getBoundingClientRect();
            const x = (bounds.left - rect.left + bounds.width / 2) / scale;
            const y = (bounds.top - rect.top + bounds.height / 2) / scale;
            const rx = (bounds.width / 2 + 1) / scale;
            const ry = (bounds.height / 2 + 1) / scale;
            return `M ${x - rx} ${y} A ${rx} ${ry} 0 1 0 ${x + rx} ${y} A ${rx} ${ry} 0 1 0 ${x - rx} ${y} Z`;
        });
        const clipPath = holes.length
            ? `path(evenodd, "M ${(clip.left - rect.left) / scale} ${(clip.top - rect.top) / scale} H ${(clip.right - rect.left) / scale} V ${(clip.bottom - rect.top) / scale} H ${(clip.left - rect.left) / scale} Z ${holes.join(' ')}")`
            : `inset(${(clip.top - rect.top) / scale}px ${(rect.right - clip.right) / scale}px ${(rect.bottom - clip.bottom) / scale}px ${(clip.left - rect.left) / scale}px)`;
        Object.assign(layer.style, {
            left: `${rect.left / scale}px`, top: `${rect.top / scale}px`,
            width: `${rect.width / scale}px`, height: `${rect.height / scale}px`,
            zIndex: String(outerZ === null ? 30 : outerZ + 1),
            clipPath,
        });
        positionPopup(tooltip);
        positionPopup(panel);
    };

    const schedule = () => {
        if (!frame) frame = window.requestAnimationFrame(() => {
            frame = 0;
            refresh();
        });
    };

    const clear = () => {
        const focused = layer?.contains(document.activeElement) || panel?.contains(document.activeElement);
        controller?.abort();
        controller = null;
        observer?.disconnect();
        observer = null;
        window.cancelAnimationFrame(frame);
        window.clearTimeout(tooltipTimer);
        frame = 0;
        closePanel();
        layer?.remove();
        tooltip?.remove();
        layer = null;
        tooltip = null;
        paths = [];
        if (focused) focusImage();
    };

    const render = () => {
        clear();
        if (settings.enabled !== true || settings.isSelf !== false) return;
        entries = [getRankAppearance('trust', settings.ranks?.trust)].filter(Boolean);
        if (!entries.length) return;
        controller = new window.AbortController();
        const listen = (target, event, callback, extra = {}) => target.addEventListener(event, callback, { ...extra, signal: controller.signal });
        layer = document.createElement('span');
        layer.className = 'rank-avatar-layer';
        layer.setAttribute('role', 'group');
        layer.setAttribute('aria-label', typeof settings.label === 'string' ? settings.label : '表示ランク');
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('class', 'rank-avatar-rings');
        for (const [index, entry] of entries.entries()) {
            const group = document.createElementNS(SVG_NS, 'g');
            group.setAttribute('class', 'rank-avatar-segment');
            group.style.color = entry.color;
            const line = document.createElementNS(SVG_NS, 'path');
            line.setAttribute('d', RING);
            line.setAttribute('class', 'rank-avatar-line');
            line.setAttribute('aria-hidden', 'true');
            const hit = document.createElementNS(SVG_NS, 'path');
            hit.setAttribute('d', RING);
            hit.setAttribute('class', 'rank-avatar-hit');
            hit.dataset.rankType = entry.type;
            hit.setAttribute('role', 'button');
            hit.setAttribute('aria-label', `${entry.label}。ランク情報を開く`);
            hit.setAttribute('aria-haspopup', 'dialog');
            hit.setAttribute('aria-expanded', 'false');
            hit.setAttribute('tabindex', index === 0 ? '0' : '-1');
            const activate = event => {
                event.preventDefault();
                event.stopPropagation();
                openPanel(hit);
            };
            listen(hit, 'click', activate);
            listen(hit, 'pointerenter', event => {
                if (event.pointerType !== 'touch') showTooltip(hit, entry);
            });
            listen(hit, 'pointerleave', () => {
                if (document.activeElement !== hit) deferHideTooltip();
            });
            listen(hit, 'focus', () => {
                paths.forEach(path => path.setAttribute('tabindex', path === hit ? '0' : '-1'));
                showTooltip(hit, entry);
            });
            listen(hit, 'blur', hideTooltip);
            listen(hit, 'keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') return activate(event);
                let next;
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % paths.length;
                else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + paths.length - 1) % paths.length;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = paths.length - 1;
                else return;
                event.preventDefault();
                event.stopPropagation();
                paths[next].focus();
            });
            paths.push(hit);
            group.append(line, hit);
            svg.append(group);
        }
        layer.append(svg);
        tooltip = document.createElement('span');
        tooltip.id = `${id}-tooltip`;
        tooltip.className = 'rank-avatar-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.hidden = true;
        listen(tooltip, 'pointerenter', () => window.clearTimeout(tooltipTimer));
        listen(tooltip, 'pointerleave', deferHideTooltip);
        document.body.append(layer, tooltip);
        observer = new window.ResizeObserver(schedule);
        observer.observe(image);
        listen(image, 'load', schedule);
        listen(window, 'scroll', schedule, { capture: true, passive: true });
        listen(window, 'resize', schedule, { passive: true });
        if (window.visualViewport) {
            listen(window.visualViewport, 'resize', schedule, { passive: true });
            listen(window.visualViewport, 'scroll', schedule, { passive: true });
        }
        listen(document, 'pointerdown', event => {
            if (!layer?.contains(event.target) && !panel?.contains(event.target)) {
                closePanel(Boolean(panel?.contains(document.activeElement)));
                hideTooltip();
            }
        }, { capture: true });
        listen(document, 'keydown', event => {
            if (event.key === 'Escape' && (panel || !tooltip.hidden)) {
                event.preventDefault();
                event.stopPropagation();
                closePanel(true);
                hideTooltip();
            }
        });
        listen(document, 'focusin', event => {
            if (panel && !panel.contains(event.target) && !layer.contains(event.target)) closePanel();
        });
        refresh();
    };

    const handle = {
        update(next = {}) {
            if (destroyed) return;
            settings = { ...settings, ...next };
            render();
        },
        refresh,
        destroy() {
            if (destroyed) return;
            clear();
            destroyed = true;
            instances.delete(image);
        },
    };
    instances.set(image, handle);
    render();
    return handle;
}

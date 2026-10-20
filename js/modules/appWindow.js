import { ICONS } from '../icons.js';

const SNAP_EDGE = 28;
const SNAP_CORNER = 96;
const ANIMATION_MS = 180;

const embeddedWindow = window.frameElement?.classList.contains('app-window-frame') ? window.frameElement : null;
if (embeddedWindow) {
    document.documentElement.dataset.appWindowContent = 'true';
    let routeIndex = 0;
    history.replaceState({ ...history.state, appWindowRouteIndex: routeIndex }, '');
    window.addEventListener('popstate', event => {
        if (Number.isInteger(event.state?.appWindowRouteIndex)) {
            routeIndex = event.state.appWindowRouteIndex;
        } else {
            routeIndex += 1;
            history.replaceState({ ...history.state, appWindowRouteIndex: routeIndex }, '');
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        embeddedWindow.dispatchEvent(new Event('app-window-minimize'));
    });
    document.addEventListener('click', event => {
        if (routeIndex || !event.target.closest('[data-action="history-back"], .back-button')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        embeddedWindow.dispatchEvent(new Event('app-window-close'));
    }, true);
}

export class AppWindow {
    constructor({ element, header, title, icon = ICONS.phone, onClose, maximized = true }) {
        this.element = element;
        this.header = header;
        this.title = title;
        this.onClose = onClose;
        this.maximized = maximized;
        this.events = new AbortController();
        this.frame = null;
        this.animation = null;
        this.snapZone = null;
        const width = Math.min(1000, innerWidth - 32);
        const height = Math.min(680, innerHeight - 32);
        this.bounds = { x: (innerWidth - width) / 2, y: (innerHeight - height) / 2, width, height };
        element.classList.add('app-window');
        header.classList.add('app-window-header');
        this.controls = document.createElement('div');
        this.controls.className = 'app-window-controls';
        this.controls.innerHTML = `<button type="button" data-window-action="minimize" aria-label="最小化" title="最小化">${ICONS.minimize}</button><button type="button" data-window-action="maximize"></button><button type="button" data-window-action="close" aria-label="閉じる" title="閉じる">${ICONS.close}</button>`;
        header.append(this.controls);
        this.listen(this.controls, 'click', event => {
            const action = event.target.closest('[data-window-action]')?.dataset.windowAction;
            if (action === 'minimize') this.minimize();
            if (action === 'maximize') this.toggleMaximize();
            if (action === 'close') this.onClose();
        });
        this.listen(header, 'dblclick', event => {
            if (!event.target.closest('button, a, input')) this.toggleMaximize();
        });
        this.listen(header, 'pointerdown', event => {
            if (event.target.closest('button, a, input')) return;
            this.startGesture(event, 'move');
        });
        this.handles = [];
        for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
            const handle = document.createElement(edge === 'se' ? 'button' : 'div');
            handle.className = `app-window-resize app-window-resize-${edge}`;
            if (edge === 'se') {
                handle.type = 'button';
                handle.setAttribute('aria-label', 'サイズを変更');
                handle.title = 'サイズを変更';
                this.listen(handle, 'keydown', event => {
                    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
                    if (!direction) return;
                    event.preventDefault();
                    const step = event.shiftKey ? 40 : 10;
                    this.bounds.width += direction[0] * step;
                    this.bounds.height += direction[1] * step;
                    this.fitBounds(); this.render();
                });
            } else handle.setAttribute('aria-hidden', 'true');
            this.listen(handle, 'pointerdown', event => this.startGesture(event, edge));
            element.append(handle); this.handles.push(handle);
        }
        this.dock = document.createElement('button');
        this.dock.type = 'button';
        this.dock.className = 'app-window-dock';
        this.dock.hidden = true;
        this.dock.innerHTML = icon;
        this.dock.title = `${title}に戻る`;
        this.dock.setAttribute('aria-label', `${title}に戻る`);
        this.listen(this.dock, 'click', () => this.show());
        document.body.append(this.dock);
        this.snapPreview = document.createElement('div');
        this.snapPreview.className = 'app-window-snap-preview';
        this.snapPreview.hidden = true;
        document.body.append(this.snapPreview);
        this.listen(element, 'keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); this.minimize(); }
        });
        this.listen(window, 'resize', () => { this.stopAnimation(); this.fitBounds(); this.render(); });
        this.fitBounds(); this.render();
    }

    listen(target, type, handler) {
        target.addEventListener(type, handler, { signal: this.events.signal });
    }

    fitBounds() {
        const b = this.bounds;
        b.width = Math.max(Math.min(340, innerWidth), Math.min(b.width, innerWidth));
        b.height = Math.max(Math.min(280, innerHeight), Math.min(b.height, innerHeight));
        b.x = Math.max(0, Math.min(b.x, innerWidth - b.width));
        b.y = Math.max(0, Math.min(b.y, innerHeight - b.height));
    }

    currentRect() {
        if (this.frame) return { ...this.frame };
        if (this.maximized) return { x: 0, y: 0, width: innerWidth, height: innerHeight };
        return { ...this.bounds };
    }

    stopAnimation() {
        if (this.animation) cancelAnimationFrame(this.animation);
        this.animation = null;
        this.frame = null;
    }

    animateTo(target, { maximized = false, preserveBounds = false } = {}) {
        const from = this.currentRect();
        this.stopAnimation();
        const to = { x: target.x, y: target.y, width: Math.max(0, target.width), height: Math.max(0, target.height) };
        const settle = () => {
            this.frame = null;
            if (!preserveBounds) this.bounds = { ...to };
            this.maximized = maximized;
            this.render();
        };
        const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion) { settle(); return; }
        const start = performance.now();
        const step = now => {
            const progress = Math.min(1, (now - start) / ANIMATION_MS);
            const eased = 1 - Math.pow(1 - progress, 3);
            this.frame = {
                x: from.x + (to.x - from.x) * eased,
                y: from.y + (to.y - from.y) * eased,
                width: from.width + (to.width - from.width) * eased,
                height: from.height + (to.height - from.height) * eased,
            };
            this.render();
            if (progress < 1) this.animation = requestAnimationFrame(step);
            else { this.animation = null; settle(); }
        };
        this.animation = requestAnimationFrame(step);
    }

    render() {
        const animating = Boolean(this.frame);
        const rect = this.frame || (this.maximized ? { x: 0, y: 0, width: innerWidth, height: innerHeight } : this.bounds);
        this.element.dataset.maximized = String(this.maximized && !animating);
        this.element.style.left = `${rect.x}px`;
        this.element.style.top = `${rect.y}px`;
        this.element.style.width = `${rect.width}px`;
        this.element.style.height = `${rect.height}px`;
        const button = this.controls.querySelector('[data-window-action="maximize"]');
        const label = this.maximized ? '元のサイズに戻す' : '最大化';
        button.setAttribute('aria-label', label); button.title = label;
        button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${this.maximized ? '<path d="M8 8V4h12v12h-4"/><rect x="4" y="8" width="12" height="12" rx="1"/>' : '<rect x="4" y="4" width="16" height="16" rx="1"/>'}</svg>`;
    }

    toggleMaximize() {
        if (this.maximized) {
            this.animateTo(this.bounds, { maximized: false });
        } else {
            this.animateTo({ x: 0, y: 0, width: innerWidth, height: innerHeight }, { maximized: true, preserveBounds: true });
        }
    }

    snapZoneFor(x, y) {
        const nearLeft = x <= SNAP_EDGE, nearRight = x >= innerWidth - SNAP_EDGE;
        const nearTop = y <= SNAP_EDGE, nearBottom = y >= innerHeight - SNAP_EDGE;
        const cornerLeft = x <= SNAP_CORNER, cornerRight = x >= innerWidth - SNAP_CORNER;
        const cornerTop = y <= SNAP_CORNER, cornerBottom = y >= innerHeight - SNAP_CORNER;
        if (cornerTop && cornerLeft) return 'nw';
        if (cornerTop && cornerRight) return 'ne';
        if (cornerBottom && cornerLeft) return 'sw';
        if (cornerBottom && cornerRight) return 'se';
        if (nearTop) return 'n';
        if (nearBottom) return 's';
        if (nearLeft) return 'w';
        if (nearRight) return 'e';
        return null;
    }

    snapRect(zone) {
        const halfWidth = innerWidth / 2, halfHeight = innerHeight / 2;
        const zones = {
            n: { x: 0, y: 0, width: innerWidth, height: halfHeight },
            s: { x: 0, y: halfHeight, width: innerWidth, height: halfHeight },
            w: { x: 0, y: 0, width: halfWidth, height: innerHeight },
            e: { x: halfWidth, y: 0, width: halfWidth, height: innerHeight },
            nw: { x: 0, y: 0, width: halfWidth, height: halfHeight },
            ne: { x: halfWidth, y: 0, width: halfWidth, height: halfHeight },
            sw: { x: 0, y: halfHeight, width: halfWidth, height: halfHeight },
            se: { x: halfWidth, y: halfHeight, width: halfWidth, height: halfHeight },
        };
        return { ...zones[zone] };
    }

    showSnap(zone) {
        const rect = this.snapRect(zone);
        this.snapPreview.style.left = `${rect.x}px`;
        this.snapPreview.style.top = `${rect.y}px`;
        this.snapPreview.style.width = `${rect.width}px`;
        this.snapPreview.style.height = `${rect.height}px`;
        this.snapPreview.hidden = false;
    }

    hideSnap() {
        this.snapPreview.hidden = true;
        this.snapZone = null;
    }

    updateSnap(x, y) {
        const zone = this.snapZoneFor(x, y);
        if (zone === this.snapZone) return;
        this.snapZone = zone;
        if (zone) this.showSnap(zone);
        else this.hideSnap();
    }

    startGesture(event, edge) {
        if (event.button !== 0 || (this.maximized && edge !== 'move') || this.gesture) return;
        event.preventDefault();
        if (this.frame) {
            this.bounds = this.currentRect();
            this.maximized = false;
        }
        this.stopAnimation();
        this.hideSnap();
        const target = event.currentTarget;
        let initial = { ...this.bounds };
        let startX = event.clientX, startY = event.clientY;
        const headerRect = this.header.getBoundingClientRect();
        const gripX = Math.max(0, Math.min(1, (event.clientX - headerRect.left) / headerRect.width));
        const gripY = event.clientY - headerRect.top;
        const gesture = new AbortController();
        this.gesture = gesture;
        target.setPointerCapture(event.pointerId);
        this.element.classList.add('app-window-moving');
        target.addEventListener('pointermove', move => {
            if (move.pointerId !== event.pointerId) return;
            let dx = move.clientX - startX, dy = move.clientY - startY;
            if (this.maximized && edge === 'move') {
                if (Math.hypot(dx, dy) < 6) return;
                this.maximized = false;
                this.bounds.x = move.clientX - this.bounds.width * gripX;
                this.bounds.y = move.clientY - gripY;
                this.fitBounds();
                initial = { ...this.bounds };
                startX = move.clientX; startY = move.clientY;
                dx = 0; dy = 0;
            }
            if (edge === 'move') {
                this.bounds = { ...initial, x: initial.x + dx, y: initial.y + dy };
                this.updateSnap(move.clientX, move.clientY);
            }
            else {
                this.hideSnap();
                const minWidth = Math.min(340, innerWidth), minHeight = Math.min(280, innerHeight);
                const left = edge.includes('w') ? Math.max(0, Math.min(initial.x + dx, initial.x + initial.width - minWidth)) : initial.x;
                const top = edge.includes('n') ? Math.max(0, Math.min(initial.y + dy, initial.y + initial.height - minHeight)) : initial.y;
                const right = edge.includes('e') ? Math.min(innerWidth, Math.max(initial.x + minWidth, initial.x + initial.width + dx)) : initial.x + initial.width;
                const bottom = edge.includes('s') ? Math.min(innerHeight, Math.max(initial.y + minHeight, initial.y + initial.height + dy)) : initial.y + initial.height;
                this.bounds = { x: left, y: top, width: right - left, height: bottom - top };
            }
            this.fitBounds(); this.render();
        }, { signal: gesture.signal });
        const finish = () => {
            const zone = this.snapZone;
            gesture.abort(); this.gesture = null;
            if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
            this.element.classList.remove('app-window-moving');
            this.hideSnap();
            if (zone && edge === 'move' && !this.maximized) {
                this.animateTo(this.snapRect(zone), { maximized: false });
            }
        };
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(type, finish, { signal: gesture.signal });
    }

    show() {
        this.dock.hidden = true;
        if (!this.element.open) this.element.show();
        this.element.focus({ preventScroll: true });
    }

    minimize() {
        this.element.close();
        this.dock.hidden = false;
        this.dock.focus({ preventScroll: true });
    }

    destroy() {
        this.stopAnimation();
        this.gesture?.abort();
        this.events.abort();
        this.dock.remove();
        this.snapPreview.remove();
        this.controls.remove();
        this.handles.forEach(handle => handle.remove());
        this.element.close();
    }
}

// ---------------------------------------------------------------------------
// Nyaitter 内リンクを中クリック (ホイール / auxclick) でアプリ内ウィンドウに開く
// ---------------------------------------------------------------------------

function findInternalAnchor(target) {
    const anchor = target?.closest?.('a[href]');
    if (!anchor) return null;
    if (anchor.target && anchor.target !== '_self') return null;
    if (anchor.hasAttribute('download')) return null;
    const href = anchor.getAttribute('href') || '';
    if (!href.startsWith('#')) return null;
    return { anchor, hash: href };
}

function routeTitle(route) {
    const labels = {
        'post-detail': 'ポスト',
        'post-activity': 'ポストのアクティビティ',
        profile: 'プロフィール',
        search: '検索結果',
        explore: '見つける',
        notifications: '通知',
        likes: 'いいね',
        stars: 'スター',
        dm: 'ダイレクトメッセージ',
        settings: '設定',
        groups: 'グループ',
        'group-detail': 'グループ',
        stages: 'ステージ',
        stage: 'ステージ',
        rule: 'ルール',
        'docs-portal': 'ドキュメント',
        'docs-api': 'APIドキュメント',
        'doc-detail': 'ドキュメント',
        'nyaitter-auth': '認証',
        'admin-reports': '通報',
        'admin-report-detail': '通報',
        'admin-logs': 'ログ',
    };
    return labels[route.name] || 'Nyaitter';
}

async function openInternalLinkWindow(hash, label) {
    if (!hash || hash === '#') return false;
    const [routeTable, state] = await Promise.all([
        import('../routeTable.js'),
        import('../state.js'),
    ]);
    const route = routeTable.resolveRoute(hash, state.getCurrentUser());
    if (!route) return false;

    const dialog = document.createElement('dialog');
    dialog.className = 'app-link-window';
    const header = document.createElement('div');
    header.className = 'app-window-header';
    const heading = document.createElement('h2');
    heading.textContent = (label || '').trim() || routeTitle(route);
    header.append(heading);
    const body = document.createElement('div');
    body.className = 'app-window-body';
    dialog.append(header, body);
    body.innerHTML = '<div class="spinner"></div>';
    document.body.append(dialog);

    const frame = document.createElement('iframe');
    frame.className = 'app-window-frame';
    frame.title = heading.textContent;
    const url = new URL(location.href);
    url.hash = hash;
    frame.src = url.href;
    let closed = false;
    const closeWindow = () => {
        if (closed) return;
        closed = true;
        frame.remove();
        linkWindow.destroy();
        dialog.remove();
    };

    const linkWindow = new AppWindow({
        element: dialog,
        header,
        title: heading.textContent,
        onClose: closeWindow,
        maximized: false,
    });
    linkWindow.show();

    frame.addEventListener('app-window-close', closeWindow);
    frame.addEventListener('app-window-minimize', () => linkWindow.minimize());
    frame.addEventListener('load', () => {
        if (closed) return;
        body.classList.remove('app-window-loading');
        body.querySelector('.spinner')?.remove();
    });
    body.classList.add('app-window-loading');
    body.append(frame);

    return true;
}

function handleInternalAuxClick(event) {
    if (event.button !== 1) return;
    const found = findInternalAnchor(event.target);
    if (!found) return;
    event.preventDefault();
    if (found.hash === '#') return;
    if (embeddedWindow) {
        window.parent.document.dispatchEvent(new window.parent.CustomEvent('app-window-open-link', {
            detail: { hash: found.hash, label: found.anchor.textContent },
        }));
    } else {
        void openInternalLinkWindow(found.hash, found.anchor.textContent);
    }
}

function handleInternalMiddleDown(event) {
    if (event.button !== 1) return;
    if (findInternalAnchor(event.target)) event.preventDefault();
}

document.addEventListener('auxclick', handleInternalAuxClick);
document.addEventListener('mousedown', handleInternalMiddleDown);

document.addEventListener('app-window-open-link', event => {
    const { hash, label } = event.detail || {};
    if (typeof hash === 'string' && hash.startsWith('#')) void openInternalLinkWindow(hash, label);
});

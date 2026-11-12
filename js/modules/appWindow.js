import { ICONS } from '../icons.js';

// Tab-compatible replacement for the original floating AppWindow. The original
// call panel (callsCore.js / callView.js) stays unchanged and keeps using this
// constructor, but the panel is hosted inside #call-content instead of a window.
export class AppWindow {
    constructor({ element, header, title, icon = ICONS.phone, onClose, maximized = true } = {}) {
        this.element = element;
        this.header = header;
        this.title = title;
        this.onClose = onClose;
        this.maximized = maximized;
        this.bounds = { x: 0, y: 0, width: element?.offsetWidth || 0, height: element?.offsetHeight || 0 };

        element.classList.add('app-window');
        element.setAttribute('data-maximized', 'true');
        header?.classList.add('app-window-header');

        this.controls = document.createElement('div');
        this.controls.className = 'app-window-controls';
        this.controls.innerHTML = `<button type="button" data-window-action="close" aria-label="閉じる" title="閉じる">${ICONS.close}</button>`;
        this.controls.querySelector('[data-window-action="close"]')?.addEventListener('click', () => this.close());
        header?.append(this.controls);

        const host = document.getElementById('call-content');
        if (host) host.replaceChildren(element);
        else document.body.append(element);

        this.show();
        // dialog.show() focuses its first control; keep the panel itself focused
        // so the close button does not open with a visible focus ring.
        element.tabIndex = -1;
        try { element.focus({ preventScroll: true }); } catch (_) {}
    }

    close() {
        if (typeof this.onClose === 'function') this.onClose();
        // In the original window UI, closing the window left the app below.
        // In the tab UI, return to the DM/stage screen instead of an empty tab.
        const match = String(window.location.hash || '').match(/^#call\/(dm|stage)\/(.+)$/);
        if (match) {
            window.location.hash = match[1] === 'stage'
                ? `#stage/${match[2]}`
                : `#dm/${match[2]}`;
        }
    }

    show() {
        const element = this.element;
        if (!element) return;
        element.removeAttribute('hidden');
        if (typeof element.show === 'function' && !element.open) {
            try { element.show(); } catch (_) { element.setAttribute('open', ''); }
        }
    }

    minimize() {
        // Tabs have no minimize state; keep the panel visible.
    }

    toggleMaximize() {
        // Always fills the tab host.
    }

    render() {
        // Fixed to the tab host.
    }

    destroy() {
        this.element?.remove();
    }
}

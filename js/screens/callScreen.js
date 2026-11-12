import { DOM } from '../dom.js';
import { mountCallScreen } from '../modules/calls.js';
import { escapeHTML } from '../utils/helpers.js';
import { getActiveScreenContext, showScreenCompat } from '../screenManager.js';

export async function showCallScreen(kind, id, showScreenFn) {
    showScreenCompat('call-screen', showScreenFn);
    DOM.pageHeader.innerHTML = '';
    const context = getActiveScreenContext();
    const container = document.getElementById('call-content');
    if (!container) return;
    if (!id || (kind !== 'dm' && kind !== 'stage')) {
        window.location.hash = '#';
        return;
    }
    try {
        await mountCallScreen(kind, id, container, context);
    } catch (error) {
        if (context.signal.aborted) return;
        container.innerHTML = `<div class="call-error nui-empty-text"><p role="alert">${escapeHTML(error.message)}</p><a class="nui-button-secondary" href="${kind === 'stage' ? `#stage/${encodeURIComponent(id)}` : `#dm/${encodeURIComponent(id)}`}">戻る</a></div>`;
    }
}

import { DOM } from '../../dom.js';
import { escapeHTML } from '../../utils/helpers.js';

export function renderHeader(title) {
    DOM.pageHeader.innerHTML = `<h2 id="page-title" class="nui-heading">${escapeHTML(title)}</h2>`;
}

export function renderLoggedOut(content) {
    if (content) {
        content.innerHTML = '<p class="list-empty-message nui-empty-text">ログインが必要です。</p>';
    }
}

export function clearContent(content) {
    content?.replaceChildren();
}

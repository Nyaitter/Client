import { DOM } from '../../dom.js';

export function renderHeader(title) {
    DOM.pageHeader.innerHTML = `<h2 id="page-title">${title}</h2>`;
}

export function renderLoggedOut(content) {
    if (content) {
        content.innerHTML = '<p class="list-empty-message">ログインが必要です。</p>';
    }
}

export function clearContent(content) {
    content?.replaceChildren();
}

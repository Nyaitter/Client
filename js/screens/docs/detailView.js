import { DOM } from '../../dom.js';
import { ICONS } from '../../icons.js';
import { escapeHTML } from '../../utils/helpers.js';

export function renderHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-action-button">
            <button type="button" class="back-button" onclick="history.back()" aria-label="戻る">${ICONS.back}</button>
            <h2 id="doc-detail-header-title">ドキュメント</h2>
        </div>`;
}

export function renderLoading(content) {
    if (content) content.innerHTML = '<div class="spinner" aria-label="読み込み中"></div>';
}

export function renderDocument(content, title, renderedBody, updatedAt) {
    const titleElement = document.getElementById('doc-detail-header-title');
    if (titleElement && title) titleElement.textContent = title;
    if (!content) return;
    content.innerHTML = `
        <article class="doc-detail-container">
            <div class="rule-markdown-body">${renderedBody}</div>
            ${updatedAt ? `<div class="rule-footer-meta"><small>最終更新日: ${escapeHTML(updatedAt)}</small></div>` : ''}
        </article>
    `;
}

export function renderError(content) {
    if (content) content.innerHTML = '<div class="docs-empty"><p class="error-message">ドキュメントの読み込みに失敗しました。</p></div>';
}

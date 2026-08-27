import { ICONS } from '../../icons.js';
import { escapeHTML } from '../../utils/helpers.js';

export function renderHeader(pageHeader) {
    if (!pageHeader) return;
    pageHeader.innerHTML = `
        <div class="header-with-action-button">
            <button type="button" class="back-button" onclick="history.back()" aria-label="戻る">
                ${ICONS.back || '←'}
            </button>
            <h2 id="page-title">ルール</h2>
        </div>
    `;
}

export function renderLoading(content) {
    if (content) content.innerHTML = '<div class="spinner" aria-label="読み込み中"></div>';
}

export function renderRules(content, renderedHtml, updatedAt) {
    if (!content) return;
    content.innerHTML = `
        <div class="rule-container">
            <div class="rule-markdown-body">${renderedHtml}</div>
            ${updatedAt ? `<div class="rule-footer-meta"><small>最終更新日: ${escapeHTML(updatedAt)}</small></div>` : ''}
        </div>
    `;
}

export function renderError(content) {
    if (!content) return;
    content.innerHTML = `
        <div class="rule-container">
            <p class="error-message">ルールの取得に失敗しました。</p>
        </div>
    `;
}

import { ICONS } from '../../icons.js';
import { escapeHTML } from '../../utils/helpers.js';

export function renderHeader(pageHeader) {
    if (!pageHeader) return;
    pageHeader.innerHTML = `
        <div class="header-with-back-button">
            <button type="button" class="header-back-btn" data-action="history-back" aria-label="戻る">
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
        <div class="rule-container nui-page" data-nui="page">
            <article class="nui-card rule-markdown-body" data-nui="card">${renderedHtml}</article>
            ${updatedAt ? `<div class="rule-footer-meta nui-help-text"><small>最終更新日: ${escapeHTML(updatedAt)}</small></div>` : ''}
        </div>
    `;
}

export function renderError(content) {
    if (!content) return;
    content.innerHTML = `
        <div class="rule-container nui-page" data-nui="page">
            <p class="error-message nui-empty-text">ルールの取得に失敗しました。</p>
        </div>
    `;
}

import { t } from '../../modules/i18n.js';
import { DOM } from '../../dom.js';
import { ICONS } from '../../icons.js';
import { escapeHTML } from '../../utils/helpers.js';

export function renderHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-action-button">
            <button type="button" class="back-button" onclick="history.back()" aria-label="${t('admin.back_label')}">${ICONS.back}</button>
            <h2 id="doc-detail-header-title">${t('docsportal.title')}</h2>
        </div>`;
}

export function renderLoading(content) {
    if (content) content.innerHTML = `<div class="spinner" aria-label="${t('common.loading')}"></div>`;
}

export function renderDocument(content, title, renderedBody, updatedAt) {
    const titleElement = document.getElementById('doc-detail-header-title');
    if (titleElement && title) titleElement.textContent = title;
    if (!content) return;
    content.innerHTML = `
        <article class="doc-detail-container nui-page" data-nui="page">
            <div class="nui-card rule-markdown-body" data-nui="card">${renderedBody}</div>
            ${updatedAt ? `<div class="rule-footer-meta nui-help-text"><small>${t('docsdetail.last_updated', { date: escapeHTML(updatedAt) })}</small></div>` : ''}
        </article>
    `;
}

export function renderError(content) {
    if (content) content.innerHTML = `<div class="docs-empty nui-page" data-nui="page"><p class="error-message nui-empty-text">${t('docsdetail.load_failed')}</p></div>`;
}

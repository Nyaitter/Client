import { t } from '../../modules/i18n.js';
import { ICONS } from '../../icons.js';
import { escapeHTML } from '../../utils/helpers.js';

export function renderHeader(pageHeader) {
    if (!pageHeader) return;
    pageHeader.innerHTML = `
        <div class="header-with-back-button">
            <button type="button" class="header-back-btn" data-action="history-back" aria-label="${t('admin.back_label')}">
                ${ICONS.back || '←'}
            </button>
            <h2 id="page-title">${t('ruleview.title')}</h2>
        </div>
    `;
}

export function renderLoading(content) {
    if (content) content.innerHTML = `<div class="spinner" aria-label="${t('common.loading')}"></div>`;
}

export function renderRules(content, renderedHtml, updatedAt) {
    if (!content) return;
    content.innerHTML = `
        <div class="rule-container nui-page" data-nui="page">
            <article class="nui-card rule-markdown-body" data-nui="card">${renderedHtml}</article>
            ${updatedAt ? `<div class="rule-footer-meta nui-help-text"><small>${t('docsdetail.last_updated', { date: escapeHTML(updatedAt) })}</small></div>` : ''}
        </div>
    `;
}

export function renderError(content) {
    if (!content) return;
    content.innerHTML = `
        <div class="rule-container nui-page" data-nui="page">
            <p class="error-message nui-empty-text">${t('ruleview.load_failed')}</p>
        </div>
    `;
}

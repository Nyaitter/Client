import { t } from '../../modules/i18n.js';
import { DOM } from '../../dom.js';
import { renderNyarkDown } from '../../modules/nyarkdown.js';
import { getAllUsersCache } from '../../state.js';
import { getActiveScreenContext } from '../../screenManager.js';
import { showLoading } from '../../utils/helpers.js';
export function renderRuleHeader(pageHeader) {
    if (!pageHeader) return;
    pageHeader.innerHTML = `
        <h2 id="page-title">${t('settings.rule')}</h2>
        <p class="page-subtitle">${t('rule.last_updated')}</p>`;
}

export function renderLoading(content) {
    if (content) content.innerHTML = `<div class="spinner"></div>`;
}

export function renderRules(content, renderedHtml, updatedAt) {
    if (!content) return;
    const updatedText = updatedAt
        ? `${t('rule.last_updated')}: ${new Date(updatedAt).toLocaleString()}`
        : '';
    content.innerHTML = `
        <div class="rule-content">${renderedHtml}</div>
        ${updatedText ? `<p class="rule-updated-at">${updatedText}</p>` : ''}`;
}

export function renderError(content) {
    if (content) content.innerHTML = `<p class="error-message">${t('rule.load_error')}</p>`;
}

export async function mountRuleScreen(showScreenFn) {
    renderRuleHeader(DOM.pageHeader);
    if (typeof showScreenFn === 'function') {
        showScreenFn('rule-screen');
    }

    const content = document.getElementById('rule-content') || DOM.mainContent;
    if (!content) return;
    const context = getActiveScreenContext();
    const signal = context?.signal;

    renderLoading(content);
    showLoading(true);

    try {
        const response = await globalThis.NyaitterClientInstance.system.getRulesResponse({ signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (signal?.aborted) return;
        const rulesText = data?.rules || t('rulecontroller.fallback_text');
        const updatedAt = data?.updated_at
            ? new Date(data.updated_at).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            })
            : '';
        const renderedHtml = renderNyarkDown(rulesText, getAllUsersCache(), {
            allowMarkdown: true,
            allowContentDecorations: true,
            allowHeadings: true,
            allowBlockquotes: true,
        });
        renderRules(content, renderedHtml, updatedAt);
    } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) return;
        console.error('[rules] Failed to load rules:', error);
        renderError(content);
    } finally {
        if (!signal?.aborted) showLoading(false);
    }
}

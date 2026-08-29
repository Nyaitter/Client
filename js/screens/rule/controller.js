import { DOM } from '../../dom.js';
import { renderNyarkDown } from '../../modules/nyarkdown.js';
import { getAllUsersCache } from '../../state.js';
import { getActiveScreenContext } from '../../screenManager.js';
import { showLoading } from '../../utils/helpers.js';
import { renderError, renderHeader, renderLoading, renderRules } from './view.js';

export async function mountRuleScreen(showScreenFn) {
    renderHeader(DOM.pageHeader);
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
        const rulesText = data?.rules || '# ルール\n\nルールが見つかりませんでした。';
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

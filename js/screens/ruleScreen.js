import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { renderNyarkDown } from '../modules/nyarkdown.js';
import { getAllUsersCache } from '../state.js';
import { escapeHTML, showLoading } from '../utils/helpers.js';

const { apiUrl } = globalThis.NyaitterClientConfig || {};

export async function showRuleScreen(showScreenFn) {
    DOM.pageHeader.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.8rem;">
            <button type="button" class="back-button" onclick="history.back()" title="戻る" style="border:none; background:none; cursor:pointer; color:var(--text-color); display:flex; align-items:center; justify-content:center; padding:0.4rem; border-radius:50%;">
                ${ICONS.back || '←'}
            </button>
            <h2 style="margin: 0; font-size: 1.25rem;">ルール</h2>
        </div>
    `;

    if (typeof showScreenFn === 'function') {
        showScreenFn('rule-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('rule-screen')?.classList.remove('hidden');
    }

    const contentDiv = document.getElementById('rule-content') || DOM.mainContent;
    if (!contentDiv) return;

    contentDiv.innerHTML = '<div class="spinner" style="margin: 3rem auto;"></div>';
    showLoading(true);

    try {
        const rulesUrl = apiUrl ? apiUrl('/server/rules') : '/server/rules';
        const response = await fetch(rulesUrl, {
            credentials: 'include',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const rulesText = data?.rules || '# ルール\n\nルールが見つかりませんでした。';
        const updatedAt = data?.updated_at ? new Date(data.updated_at).toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        }) : '';

        const renderedHtml = renderNyarkDown(rulesText, getAllUsersCache(), {
            allowMarkdown: true,
            allowContentDecorations: true,
            allowHeadings: true,
            allowBlockquotes: true,
        });

        contentDiv.innerHTML = `
            <div class="rule-container">
                <div class="rule-markdown-body">
                    ${renderedHtml}
                </div>
                ${updatedAt ? `<div class="rule-footer-meta"><small>最終更新日: ${escapeHTML(updatedAt)}</small></div>` : ''}
            </div>
        `;
    } catch (err) {
        console.error('[rules] Failed to load rules:', err);
        contentDiv.innerHTML = `
            <div class="rule-container">
                <p class="error-message" style="text-align: center; padding: 2rem;">ルールの取得に失敗しました。</p>
            </div>
        `;
    } finally {
        showLoading(false);
    }
}

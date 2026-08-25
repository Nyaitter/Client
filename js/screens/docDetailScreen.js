import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { renderNyarkDown } from '../modules/nyarkdown.js';
import { getAllUsersCache } from '../state.js';
import { escapeHTML, showLoading } from '../utils/helpers.js';

const { apiUrl } = globalThis.NyaitterClientConfig || {};

export async function showDocDetailScreen(docId, showScreenFn) {
    DOM.pageHeader.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.8rem;">
            <button type="button" class="back-button" onclick="history.back()" title="戻る" style="border:none; background:none; cursor:pointer; color:var(--text-color); display:flex; align-items:center; justify-content:center; padding:0.4rem; border-radius:50%;">
                ${ICONS.back}
            </button>
            <h2 id="doc-detail-header-title" style="margin: 0; font-size: 1.25rem;">ドキュメント</h2>
        </div>
    `;

    if (typeof showScreenFn === 'function') {
        showScreenFn('doc-detail-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('doc-detail-screen')?.classList.remove('hidden');
    }

    const contentDiv = document.getElementById('doc-detail-content');
    if (!contentDiv) return;

    contentDiv.innerHTML = '<div class="spinner" style="margin: 3rem auto;"></div>';
    showLoading(true);

    try {
        const docUrl = apiUrl ? apiUrl(`/server/docs/${encodeURIComponent(docId)}`) : `/server/docs/${encodeURIComponent(docId)}`;
        let res = await fetch(docUrl, { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!res.ok) {
            res = await fetch(`/api/docs/${encodeURIComponent(docId)}`, { credentials: 'include', headers: { Accept: 'application/json' } });
        }
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const doc = data.document;
        if (!doc) throw new Error('Document not found');

        const titleEl = document.getElementById('doc-detail-header-title');
        if (titleEl && doc.title) {
            titleEl.textContent = doc.title;
        }

        const renderedBody = renderNyarkDown(doc.content || '', getAllUsersCache(), {
            allowMarkdown: true,
            allowContentDecorations: true,
            allowHeadings: true,
            allowBlockquotes: true,
        });

        contentDiv.innerHTML = `
            <article class="doc-detail-container">
                <div class="rule-markdown-body">
                    ${renderedBody}
                </div>
                ${doc.updated_at ? `<div class="rule-footer-meta"><small>最終更新日: ${escapeHTML(doc.updated_at)}</small></div>` : ''}
            </article>
        `;
    } catch (err) {
        console.error('[docs] Failed to load document:', err);
        contentDiv.innerHTML = `
            <div class="docs-empty">
                <p class="error-message">ドキュメントの読み込みに失敗しました。</p>
            </div>
        `;
    } finally {
        showLoading(false);
    }
}

import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { escapeHTML, showLoading } from '../utils/helpers.js';

const { apiUrl } = globalThis.NyaitterClientConfig || {};

let cachedEndpoints = null;
let cachedTagLabels = {};
let activeTag = 'all';
let currentSearchQuery = '';

function renderAuthBadge(badge) {
    if (!badge) return '<span class="docs-api-auth-tag">認証不要</span>';
    const typeClass = badge.type === 'required' ? 'docs-api-auth-required'
        : badge.type === 'admin' ? 'docs-api-auth-admin'
        : '';
    return `<span class="docs-api-auth-tag ${typeClass}">${escapeHTML(badge.label || '認証不要')}</span>`;
}

function renderEndpointsList(endpoints) {
    const listContainer = document.getElementById('docs-api-endpoints-list');
    if (!listContainer) return;

    const query = currentSearchQuery.trim().toLowerCase();
    const filtered = endpoints.filter((ep) => {
        if (activeTag !== 'all' && ep.tag !== activeTag) return false;
        if (!query) return true;
        return (
            (ep.fullPath && ep.fullPath.toLowerCase().includes(query)) ||
            (ep.summary && ep.summary.toLowerCase().includes(query)) ||
            (ep.description && ep.description.toLowerCase().includes(query)) ||
            (ep.method && ep.method.toLowerCase().includes(query)) ||
            (ep.tag && ep.tag.toLowerCase().includes(query)) ||
            (ep.tagLabel && ep.tagLabel.toLowerCase().includes(query))
        );
    });

    const countBadge = document.getElementById('docs-api-count-badge');
    if (countBadge) {
        countBadge.textContent = `${filtered.length} 件のエンドポイント`;
    }

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="docs-empty">
                <p>該当する API エンドポイントが見つかりませんでした。</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = filtered.map((ep, idx) => {
        const methodUpper = String(ep.method || 'GET').toUpperCase();
        const sdkSnippet = ep.snippets?.sdk || '';
        const curlSnippet = ep.snippets?.curl || '';
        const tagLabel = ep.tagLabel || cachedTagLabels[ep.tag] || ep.tag;

        return `
            <article class="docs-api-item" data-index="${idx}">
                <div class="docs-api-item-header" role="button" tabindex="0" aria-expanded="false">
                    <div class="docs-api-item-left">
                        <span class="docs-api-method-badge docs-api-method-${methodUpper}">${methodUpper}</span>
                        <span class="docs-api-path">${escapeHTML(ep.fullPath)}</span>
                        ${ep.summary ? `<span class="docs-api-summary" title="${escapeHTML(ep.summary)}">${escapeHTML(ep.summary)}</span>` : ''}
                    </div>
                    <div class="docs-api-item-right">
                        ${renderAuthBadge(ep.authBadge)}
                        <span class="docs-api-chevron">${ICONS.chevron_down}</span>
                    </div>
                </div>
                <div class="docs-api-item-body">
                    ${ep.description ? `<p style="margin:0 0 0.75rem; color:var(--text-color);">${escapeHTML(ep.description)}</p>` : ''}
                    <div class="docs-api-section-title">カテゴリー</div>
                    <p style="margin:0 0 0.5rem; font-weight:600;">${escapeHTML(tagLabel)} (<code>${escapeHTML(ep.tag)}</code>)</p>

                    ${sdkSnippet ? `
                        <div class="docs-api-section-title">Nyaitter.js SDK コード例</div>
                        <div class="docs-api-code-block">
                            <button type="button" class="docs-api-copy-btn" data-copy="${escapeHTML(sdkSnippet)}">コピー</button>
                            <pre><code>${escapeHTML(sdkSnippet)}</code></pre>
                        </div>
                    ` : ''}

                    ${curlSnippet ? `
                        <div class="docs-api-section-title">cURL リクエスト例</div>
                        <div class="docs-api-code-block">
                            <button type="button" class="docs-api-copy-btn" data-copy="${escapeHTML(curlSnippet)}">コピー</button>
                            <pre><code>${escapeHTML(curlSnippet)}</code></pre>
                        </div>
                    ` : ''}
                </div>
            </article>
        `;
    }).join('');

    listContainer.querySelectorAll('.docs-api-item-header').forEach((header) => {
        header.addEventListener('click', () => {
            const item = header.closest('.docs-api-item');
            const isOpen = item.classList.toggle('open');
            header.setAttribute('aria-expanded', String(isOpen));
        });
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                header.click();
            }
        });
    });

    listContainer.querySelectorAll('.docs-api-copy-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const text = btn.getAttribute('data-copy');
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                const originalText = btn.textContent;
                btn.textContent = 'コピー完了';
                setTimeout(() => { btn.textContent = originalText; }, 1500);
            } catch (err) {
                console.error('Copy failed:', err);
            }
        });
    });
}

export async function showDocsApiScreen(showScreenFn) {
    DOM.pageHeader.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <div style="display: flex; align-items: center; gap: 0.8rem;">
                <button type="button" class="back-button" onclick="history.back()" title="戻る" style="border:none; background:none; cursor:pointer; color:var(--text-color); display:flex; align-items:center; justify-content:center; padding:0.4rem; border-radius:50%;">
                    ${ICONS.back}
                </button>
                <h2 style="margin: 0; font-size: 1.25rem;">API ドキュメント</h2>
            </div>
            <a href="/api/spec" target="_blank" download="nyaitter-openapi.json" class="docs-btn-outline" title="OpenAPI 3.0 仕様 JSON をダウンロード">
                ${ICONS.download}
            </a>
        </div>
    `;

    if (typeof showScreenFn === 'function') {
        showScreenFn('docs-api-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('docs-api-screen')?.classList.remove('hidden');
    }

    const contentDiv = document.getElementById('docs-api-content');
    if (!contentDiv) return;

    contentDiv.innerHTML = '<div class="spinner" style="margin: 3rem auto;"></div>';
    showLoading(true);

    try {
        if (!cachedEndpoints) {
            const specUrl = apiUrl ? apiUrl('/server/spec/endpoints') : '/server/spec/endpoints';
            let res = await fetch(specUrl, { credentials: 'include', headers: { Accept: 'application/json' } });
            if (!res.ok) {
                res = await fetch('/api/spec/endpoints', { credentials: 'include', headers: { Accept: 'application/json' } });
            }
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            cachedEndpoints = data.endpoints || [];
            cachedTagLabels = data.tagLabels || {};
        }

        const tags = ['all', ...new Set(cachedEndpoints.map((ep) => ep.tag))];

        contentDiv.innerHTML = `
            <div class="docs-controls">
                <div class="docs-search-wrapper">
                    <span class="docs-search-icon">${ICONS.search}</span>
                    <input type="search" id="docs-api-search-input" class="docs-search-input" placeholder="検索" value="${escapeHTML(currentSearchQuery)}" />
                </div>
                <div class="docs-category-tags" role="tablist">
                    ${tags.map((tag) => `
                        <button type="button" class="docs-tag-btn ${tag === activeTag ? 'active' : ''}" data-tag="${escapeHTML(tag)}">
                            ${escapeHTML(tag === 'all' ? 'すべて' : (cachedTagLabels[tag] || tag))}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div class="docs-api-list" id="docs-api-endpoints-list"></div>
        `;

        const searchInput = document.getElementById('docs-api-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearchQuery = e.target.value;
                renderEndpointsList(cachedEndpoints);
            });
        }

        contentDiv.querySelectorAll('.docs-tag-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                contentDiv.querySelectorAll('.docs-tag-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                activeTag = btn.getAttribute('data-tag') || 'all';
                renderEndpointsList(cachedEndpoints);
            });
        });

        renderEndpointsList(cachedEndpoints);
    } catch (err) {
        console.error('[docs] Failed to load API spec:', err);
        contentDiv.innerHTML = `
            <div class="docs-empty">
                <p class="error-message">API 仕様の読み込みに失敗しました。</p>
            </div>
        `;
    } finally {
        showLoading(false);
    }
}

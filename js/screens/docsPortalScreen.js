import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { escapeHTML, showLoading } from '../utils/helpers.js';
import { showScreenCompat } from '../screenManager.js';

const { apiUrl } = globalThis.NyaitterClientConfig || {};

let cachedDocuments = null;
let activeCategory = 'all';
let currentSearchQuery = '';

function getDocumentIcon(iconName) {
    return ICONS[iconName] || ICONS.book || '';
}

function renderPortalList(documents) {
    const listContainer = document.getElementById('docs-portal-list');
    if (!listContainer) return;

    const query = currentSearchQuery.trim().toLowerCase();
    const filtered = (documents || []).filter((doc) => {
        if (activeCategory !== 'all' && doc.category !== activeCategory) return false;
        if (!query) return true;
        return (
            (doc.title && doc.title.toLowerCase().includes(query)) ||
            (doc.description && doc.description.toLowerCase().includes(query))
        );
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="docs-empty">
                <p>該当するドキュメントが見つかりませんでした。</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = filtered.map((doc) => `
        <a href="${escapeHTML(doc.url)}" class="docs-portal-item" ${doc.isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''}>
            <div class="docs-portal-item-icon">
                ${getDocumentIcon(doc.icon)}
            </div>
            <div class="docs-portal-item-main">
                <div class="docs-portal-item-header">
                    <h4 class="docs-portal-item-title">${escapeHTML(doc.title)}</h4>
                </div>
                <p class="docs-portal-item-desc">${escapeHTML(doc.description || '')}</p>
            </div>
            <div class="docs-portal-item-arrow">
                ${doc.isExternal ? ICONS.external_link : (ICONS.chevron_down ? `<span style="transform: rotate(-90deg); display:inline-flex;">${ICONS.chevron_down}</span>` : '→')}
            </div>
        </a>
    `).join('');
}

export async function showDocsPortalScreen(showScreenFn) {
    DOM.pageHeader.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.8rem;">
            <button type="button" class="back-button" onclick="history.back()" title="戻る" style="border:none; background:none; cursor:pointer; color:var(--text-color); display:flex; align-items:center; justify-content:center; padding:0.4rem; border-radius:50%;">
                ${ICONS.back}
            </button>
            <h2 style="margin: 0; font-size: 1.25rem;">ドキュメント</h2>
        </div>
    `;

    showScreenCompat('docs-portal-screen', showScreenFn);

    const contentDiv = document.getElementById('docs-portal-content');
    if (!contentDiv) return;

    contentDiv.innerHTML = '<div class="spinner" style="margin: 3rem auto;"></div>';
    showLoading(true);

    try {
        if (!cachedDocuments) {
            const docsUrl = apiUrl ? apiUrl('/server/docs') : '/server/docs';
            let res = await fetch(docsUrl, { credentials: 'include', headers: { Accept: 'application/json' } });
            if (!res.ok) {
                res = await fetch('/api/docs', { credentials: 'include', headers: { Accept: 'application/json' } });
            }
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            cachedDocuments = data.documents || [];
        }

        const categories = [
            { id: 'all', label: 'すべて' },
            ...[...new Set(cachedDocuments.map((d) => d.category).filter(Boolean))].map((cat) => ({
                id: cat,
                label: cat === 'developer' ? '開発者・API' : cat === 'guidelines' ? '規約・ガイド' : cat,
            })),
        ];

        contentDiv.innerHTML = `
            <div class="docs-controls">
                <div class="docs-search-wrapper">
                    <span class="docs-search-icon">${ICONS.search}</span>
                    <input type="search" id="docs-portal-search-input" class="docs-search-input" placeholder="検索" value="${escapeHTML(currentSearchQuery)}" />
                </div>
                ${categories.length > 2 ? `
                    <div class="docs-category-tags" role="tablist">
                        ${categories.map((cat) => `
                            <button type="button" class="docs-tag-btn ${cat.id === activeCategory ? 'active' : ''}" data-cat="${escapeHTML(cat.id)}">
                                ${escapeHTML(cat.label)}
                            </button>
                        `).join('')}
                    </div>
                ` : ''}
            </div>

            <div class="docs-portal-list" id="docs-portal-list"></div>
        `;

        const searchInput = document.getElementById('docs-portal-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearchQuery = e.target.value;
                renderPortalList(cachedDocuments);
            });
        }

        contentDiv.querySelectorAll('.docs-tag-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                contentDiv.querySelectorAll('.docs-tag-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                activeCategory = btn.getAttribute('data-cat') || 'all';
                renderPortalList(cachedDocuments);
            });
        });

        renderPortalList(cachedDocuments);
    } catch (err) {
        console.error('[docs] Failed to load documents from server:', err);
        contentDiv.innerHTML = `
            <div class="docs-empty">
                <p class="error-message">ドキュメント情報の読み込みに失敗しました。</p>
            </div>
        `;
    } finally {
        showLoading(false);
    }
}

import { renderAdvancedSearchButton } from '../search/view.js';
import { DOM } from '../../dom.js';
import { escapeHTML } from '../../utils/helpers.js';

export function renderHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-search-bar">
            <input type="search" id="search-input" placeholder="検索" aria-label="検索">
            ${renderAdvancedSearchButton()}
        </div>`;
}

export function renderInitial(activeTab) {
    if (!DOM.exploreContent) return;
    DOM.exploreContent.innerHTML = `
        <div class="explore-tabs nui-tabs" id="explore-tabs">
            <button type="button" class="tab-button nui-tab ${activeTab === 'tags' ? 'active' : ''}" data-explore-tab="tags">話題</button>
            <button type="button" class="tab-button nui-tab ${activeTab === 'hashtags' ? 'active' : ''}" data-explore-tab="hashtags">トレンド</button>
        </div>
        <div id="explore-trends-container" class="trends-widget-container">
            <div class="spinner" aria-label="読み込み中"></div>
        </div>
    `;
}

export function renderTrends(container, trends, tab) {
    const currentList = tab === 'hashtags' ? trends.hashtags : trends.tags;
    const tabTitle = tab === 'hashtags' ? 'トレンド' : '話題';
    const emptyMessage = tab === 'hashtags'
        ? '現在、トレンドのハッシュタグはありません。'
        : '現在、話題のタグはありません。';
    if (!currentList.length) {
        container.innerHTML = `<p class="explore-empty-message nui-empty-text">${emptyMessage}</p>`;
        return;
    }
    container.innerHTML = `
        <div class="trends-widget-title nui-section-title">${escapeHTML(tabTitle)}</div>
        <div class="nui-list">
        ${currentList.map((trend, index) => `
            <a href="#search/${encodeURIComponent(trend.tag_name)}" class="trend-item nui-list-item">
                <div class="trend-item-meta nui-list-meta"><span>${index + 1}</span>位</div>
                <div class="trend-item-name nui-list-title">${escapeHTML(trend.tag_name)}</div>
                <div class="trend-item-count nui-list-meta">${trend.occurrence_count}件のポスト</div>
            </a>
        `).join('')}
        </div>
    `;
}

export function renderError(container) {
    if (container) container.innerHTML = '<p class="explore-empty-message nui-empty-text">トレンドの取得に失敗しました。</p>';
}

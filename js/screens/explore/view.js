import { DOM } from '../../dom.js';
import { ICONS } from '../../icons.js';
import { escapeHTML } from '../../utils/helpers.js';

export function renderHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-search-bar">
            ${ICONS.explore}
            <input type="search" id="search-input" placeholder="検索">
        </div>`;
}

export function renderInitial(activeTab) {
    if (!DOM.exploreContent) return;
    DOM.exploreContent.innerHTML = `
        <div class="explore-tabs" id="explore-tabs">
            <button type="button" class="tab-button ${activeTab === 'tags' ? 'active' : ''}" data-explore-tab="tags">話題</button>
            <button type="button" class="tab-button ${activeTab === 'hashtags' ? 'active' : ''}" data-explore-tab="hashtags">トレンド</button>
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
        container.innerHTML = `<p class="explore-empty-message">${emptyMessage}</p>`;
        return;
    }
    container.innerHTML = `
        <div class="trends-widget-title">${escapeHTML(tabTitle)}</div>
        ${currentList.map((trend, index) => `
            <a href="#search/${encodeURIComponent(trend.tag_name)}" class="trend-item">
                <div class="trend-item-meta"><span>${index + 1}</span>位</div>
                <div class="trend-item-name">${escapeHTML(trend.tag_name)}</div>
                <div class="trend-item-count">${trend.occurrence_count}件のポスト</div>
            </a>
        `).join('')}
    `;
}

export function renderError(container) {
    if (container) container.innerHTML = '<p class="explore-empty-message">トレンドの取得に失敗しました。</p>';
}

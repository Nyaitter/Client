import { t } from '../../modules/i18n.js';
import { renderAdvancedSearchButton } from '../search/view.js';
import { DOM } from '../../dom.js';
import { escapeHTML } from '../../utils/helpers.js';

export function renderHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-search-bar">
            <input type="search" id="search-input" placeholder="${t('settings.account.search_button')}" aria-label="${t('settings.account.search_button')}">
            ${renderAdvancedSearchButton()}
        </div>`;
}

export function renderInitial(activeTab) {
    if (!DOM.exploreContent) return;
    DOM.exploreContent.innerHTML = `
        <div class="explore-tabs nui-tabs" id="explore-tabs">
            <button type="button" class="tab-button nui-tab ${activeTab === 'tags' ? 'active' : ''}" data-explore-tab="tags">${t('explore.tab_topics')}</button>
            <button type="button" class="tab-button nui-tab ${activeTab === 'hashtags' ? 'active' : ''}" data-explore-tab="hashtags">${t('explore.tab_trending')}</button>
        </div>
        <div id="explore-trends-container" class="trends-widget-container">
            <div class="spinner" aria-label="${t('common.loading')}"></div>
        </div>
    `;
}

export function renderTrends(container, trends, tab) {
    const currentList = tab === 'hashtags' ? trends.hashtags : trends.tags;
    const tabTitle = tab === 'hashtags' ? t('explore.tab_trending') : t('explore.tab_topics');
    const emptyMessage = tab === 'hashtags'
        ? t('explore.no_trending')
        : t('explore.no_topics');
    if (!currentList.length) {
        container.innerHTML = `<p class="explore-empty-message nui-empty-text">${emptyMessage}</p>`;
        return;
    }
    container.innerHTML = `
        <div class="trends-widget-title nui-section-title">${escapeHTML(tabTitle)}</div>
        <div class="nui-list">
        ${currentList.map((trend, index) => `
            <a href="#search/${encodeURIComponent(trend.tag_name)}" class="trend-item nui-list-item">
                <div class="trend-item-meta nui-list-meta"><span>${t('explore.rank', { rank: index + 1 })}</span></div>
                <div class="trend-item-name nui-list-title">${escapeHTML(trend.tag_name)}</div>
                <div class="trend-item-count nui-list-meta">${t('explore.post_count', { count: trend.occurrence_count })}</div>
            </a>
        `).join('')}
        </div>
    `;
}

export function renderError(container) {
    if (container) container.innerHTML = `<p class="explore-empty-message nui-empty-text">${t('explore.load_failed')}</p>`;
}

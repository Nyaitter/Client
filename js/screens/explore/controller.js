import { bindAdvancedSearch, renderAdvancedSearchButton } from '../searchScreen.js';
import { DOM } from '../../dom.js';
import { apiRequest } from '../../api.js';
import { initTabGroup } from '../../modules/tabSwipe.js';
import { getActiveScreenContext } from '../../screenManager.js';

import { trackSearchComposition } from '../../utils/searchIme.js';
import { t } from '../../modules/i18n.js';
import { escapeHTML } from '../../utils/helpers.js';

let activeExploreTab = 'tags';
let trendsCache = null;
let trendsRequest = null;
let trendsGeneration = 0;
const TRENDS_CACHE_TTL_MS = 60 * 1000;

export function invalidateExploreTrends() {
    trendsCache = null;
    trendsRequest = null;
    trendsGeneration += 1;
}

function renderTrendTabs(tabsContainer, trendsContainer, context, trends) {
    const renderCurrentTab = (tab) => {
        activeExploreTab = tab;
        renderTrends(trendsContainer, trends, tab);
    };
    if (tabsContainer) {
        const tabController = initTabGroup({
            container: tabsContainer,
            tabSelector: '.tab-button',
            contentContainer: trendsContainer,
            getTabKey: (button) => button.dataset.exploreTab,
            onTabChange: renderCurrentTab,
        });
        context?.addCleanup(() => tabController.destroy());
    }
    renderCurrentTab(activeExploreTab);
}

export async function mountExploreScreen(showScreenFn) {
    renderHeader();
    if (typeof showScreenFn === 'function') showScreenFn('explore-screen');

    const context = getActiveScreenContext();
    const signal = context?.signal;
    bindAdvancedSearch(DOM.pageHeader, context);
    const searchInput = document.getElementById('search-input');
    const isComposing = searchInput && trackSearchComposition(searchInput);
    searchInput?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || isComposing(event)) return;
        const query = searchInput.value.trim();
        if (query) window.location.hash = `#search/${encodeURIComponent(query)}`;
    });

    renderInitial(activeExploreTab);
    const tabsContainer = document.getElementById('explore-tabs');
    const trendsContainer = document.getElementById('explore-trends-container');
    if (!trendsContainer) return;

    const generation = trendsGeneration;
    const cached = trendsCache && trendsCache.expiresAt > Date.now()
        ? trendsCache.value
        : null;
    if (cached) {
        renderTrendTabs(tabsContainer, trendsContainer, context, cached);
        return;
    }

    try {
        if (!trendsRequest) {
            const request = apiRequest('/server/api/posts/trending-hashtags?limit=30')
                .then(({ data: responseData, error }) => {
                    if (error) throw error;
                    const allTrends = Array.isArray(responseData?.trends)
                        ? responseData.trends
                        : (Array.isArray(responseData) ? responseData : []);
                    const hashtags = Array.isArray(responseData?.hashtags) && responseData.hashtags.length > 0
                        ? responseData.hashtags
                        : allTrends.filter((item) => String(item.tag_name || '').startsWith('#'));
                    const tags = Array.isArray(responseData?.tags) && responseData.tags.length > 0
                        ? responseData.tags
                        : allTrends.filter((item) => !String(item.tag_name || '').startsWith('#'));
                    return { hashtags, tags };
                })
                .finally(() => {
                    if (trendsRequest === request) trendsRequest = null;
                });
            trendsRequest = request;
        }
        const trends = await trendsRequest;
        if (signal?.aborted || generation !== trendsGeneration) return;
        trendsCache = {
            value: trends,
            expiresAt: Date.now() + TRENDS_CACHE_TTL_MS,
        };
        renderTrendTabs(tabsContainer, trendsContainer, context, trends);
    } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) return;
        console.error('トレンドの取得に失敗:', error);
        renderError(trendsContainer);
    }
}

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

import { DOM } from '../../dom.js';
import { apiRequest } from '../../api.js';
import { initTabGroup } from '../../modules/tabSwipe.js';
import { getActiveScreenContext } from '../../screenManager.js';
import { renderError, renderHeader, renderInitial, renderTrends } from './view.js';

let activeExploreTab = 'tags';
let trendsCache = null;
let trendsRequest = null;
const TRENDS_CACHE_TTL_MS = 60 * 1000;

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
    const searchInput = document.getElementById('search-input');
    searchInput?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const query = searchInput.value.trim();
        if (query) window.location.hash = `#search/${encodeURIComponent(query)}`;
    });

    renderInitial(activeExploreTab);
    const tabsContainer = document.getElementById('explore-tabs');
    const trendsContainer = document.getElementById('explore-trends-container');
    if (!trendsContainer) return;

    const cached = trendsCache && trendsCache.expiresAt > Date.now()
        ? trendsCache.value
        : null;
    if (cached) {
        renderTrendTabs(tabsContainer, trendsContainer, context, cached);
        return;
    }

    try {
        if (!trendsRequest) {
            trendsRequest = apiRequest('/server/api/posts/trending-hashtags?limit=30')
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
                    trendsRequest = null;
                });
        }
        const trends = await trendsRequest;
        if (signal?.aborted) return;
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

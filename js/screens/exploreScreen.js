import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { api } from '../api.js';
import { initTabGroup } from '../modules/tabSwipe.js';
import { escapeHTML, showLoading } from '../utils/helpers.js';

let activeExploreTab = 'tags';

export async function showExploreScreen(showScreenFn) {
    DOM.pageHeader.innerHTML = `
        <div class="header-search-bar">
            ${ICONS.explore}
            <input type="search" id="search-input" placeholder="検索">
        </div>`;
    const searchInput = document.getElementById('search-input');
    const performSearch = () => {
        const query = searchInput?.value.trim();
        if (query) {
            window.location.hash = `#search/${encodeURIComponent(query)}`;
        }
    };
    if (searchInput) {
        searchInput.onkeydown = (e) => {
            if (e.key === 'Enter') performSearch();
        };
    }

    if (typeof showScreenFn === 'function') {
        showScreenFn('explore-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('explore-screen')?.classList.remove('hidden');
    }

    const contentDiv = DOM.exploreContent;
    contentDiv.innerHTML = `
        <div class="explore-tabs" id="explore-tabs">
            <button type="button" class="tab-button ${activeExploreTab === 'tags' ? 'active' : ''}" data-explore-tab="tags">話題</button>
            <button type="button" class="tab-button ${activeExploreTab === 'hashtags' ? 'active' : ''}" data-explore-tab="hashtags">トレンド</button>
        </div>
        <div id="explore-trends-container" class="trends-widget-container">
            <div class="spinner"></div>
        </div>
    `;

    const tabsContainer = document.getElementById('explore-tabs');
    const trendsContainer = document.getElementById('explore-trends-container');

    try {
        const { data: trends, error } = await api.rpc('get_trending_hashtags');
        if (error) throw error;

        const allTrends = Array.isArray(trends) ? trends : [];
        const hashtagTrends = allTrends.filter((item) => String(item.tag_name || '').startsWith('#'));
        const tagTrends = allTrends.filter((item) => !String(item.tag_name || '').startsWith('#'));

        const renderTrendsForTab = (tab) => {
            activeExploreTab = tab;
            const currentList = tab === 'hashtags' ? hashtagTrends : tagTrends;
            const tabTitle = tab === 'hashtags' ? 'トレンド' : '話題';
            const emptyMessage = tab === 'hashtags'
                ? '現在、トレンドのハッシュタグはありません。'
                : '現在、話題のタグはありません。';

            if (currentList.length === 0) {
                trendsContainer.innerHTML = `<p style="padding: 2rem; text-align: center; color: var(--secondary-text-color);">${emptyMessage}</p>`;
                return;
            }

            let trendsHtml = `<div class="trends-widget-title">${escapeHTML(tabTitle)}</div>`;
            currentList.forEach((trend, index) => {
                trendsHtml += `
                    <a href="#search/${encodeURIComponent(trend.tag_name)}" class="trend-item">
                        <div class="trend-item-meta">
                            <span>${index + 1}</span>位
                        </div>
                        <div class="trend-item-name">${escapeHTML(trend.tag_name)}</div>
                        <div class="trend-item-count">${trend.occurrence_count}件のポスト</div>
                    </a>
                `;
            });
            trendsContainer.innerHTML = trendsHtml;
        };

        if (tabsContainer && trendsContainer) {
            initTabGroup({
                container: tabsContainer,
                tabSelector: '.tab-button',
                contentContainer: trendsContainer,
                getTabKey: (btn) => btn.dataset.exploreTab,
                onTabChange: (tab) => {
                    renderTrendsForTab(tab);
                },
            });
        }

        renderTrendsForTab(activeExploreTab);
    } catch (err) {
        console.error('トレンドの取得に失敗:', err);
        if (trendsContainer) {
            trendsContainer.innerHTML =
                '<p style="padding: 2rem; text-align: center; color: var(--secondary-text-color);">トレンドの取得に失敗しました。</p>';
        }
    } finally {
        showLoading(false);
    }
}

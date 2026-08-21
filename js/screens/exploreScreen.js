import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { api } from '../api.js';
import { escapeHTML, showLoading } from '../utils/helpers.js';

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
    contentDiv.innerHTML = '<div class="spinner"></div>';

    try {
        const { data: trends, error } = await api.rpc('get_trending_hashtags');
        if (error) throw error;

        if (trends && trends.length > 0) {
            let trendsHtml = `
                <div class="trends-widget-container">
                    <div class="trends-widget-title">トレンド</div>
            `;
            trends.forEach((trend, index) => {
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
            trendsHtml += `</div>`;
            contentDiv.innerHTML = trendsHtml;
        } else {
            contentDiv.innerHTML =
                '<p style="padding: 2rem; text-align: center; color: var(--secondary-text-color);">現在、トレンドはありません。</p>';
        }
    } catch (err) {
        console.error('トレンドの取得に失敗:', err);
        contentDiv.innerHTML =
            '<p style="padding: 2rem; text-align: center; color: var(--secondary-text-color);">トレンドの取得に失敗しました。</p>';
    } finally {
        showLoading(false);
    }
}

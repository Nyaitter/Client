import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { apiRequest } from '../api.js';
import { escapeHTML, showLoading } from '../utils/helpers.js';
import { setupTabbedListView } from '../modules/tabbedView.js';
import {
    getPostActivityCacheKey,
    getScreenDataCache,
    setScreenDataCache,
} from '../modules/cache.js';

export async function showPostActivityScreen(postId, initialTab = 'quotes', options = {}, maybeShowScreenFn = null) {
    const normalizedPostId = Number(postId);
    if (!Number.isInteger(normalizedPostId) || normalizedPostId <= 0) {
        throw new Error('無効なポストIDです。');
    }

    let showScreenFn = maybeShowScreenFn;
    let forceRefresh = false;
    let resetScroll = false;
    if (typeof options === 'function') {
        showScreenFn = options;
    } else if (options && typeof options === 'object') {
        forceRefresh = Boolean(options.forceRefresh);
        resetScroll = Boolean(options.resetScroll);
        if (typeof options.showScreenFn === 'function') {
            showScreenFn = options.showScreenFn;
        }
    }

    DOM.pageHeader.innerHTML = `
        <div class="header-with-back-button">
            <button class="header-back-btn" data-action="history-back">${ICONS.back}</button>
            <h2 id="page-title">ポストアクティビティ</h2>
        </div>`;

    if (typeof showScreenFn === 'function') {
        showScreenFn('post-activity-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('post-activity-screen')?.classList.remove('hidden');
    }

    const contentDiv = DOM.postActivityContent;
    const baseCacheKey = getPostActivityCacheKey(normalizedPostId);

    // 画面進入時は要素を一度消してローディングを表示
    if (!forceRefresh) {
        contentDiv.innerHTML = '<div class="spinner" style="margin: 3rem auto;"></div>';
    }

    const fetchTabItems = async (endpoint, cacheKey, shouldForce = false) => {
        let cached = shouldForce ? null : getScreenDataCache(cacheKey);
        if (cached) return cached;
        const { data, error } = await apiRequest(endpoint);
        if (error || !data) {
            throw new Error(error || 'データの取得に失敗しました');
        }
        setScreenDataCache(cacheKey, data);
        return data;
    };

    try {
        // メタデータ（ポスト主かどうか）および初期状態の取得
        const summaryData = await fetchTabItems(
            `/server/api/posts/${normalizedPostId}/activity`,
            `${baseCacheKey}_summary`,
            forceRefresh,
        );
        const isAuthor = Boolean(summaryData.is_author);

        const tabs = [
            {
                key: 'quotes',
                label: '引用',
                count: summaryData.counts?.quotes ?? (Array.isArray(summaryData.quotes) ? summaryData.quotes.length : undefined),
                type: 'posts',
                emptyText: '引用ポストはまだありません',
                fetch: async (shouldForce) => {
                    const d = await fetchTabItems(
                        `/server/api/posts/${normalizedPostId}/quotes`,
                        `${baseCacheKey}_quotes`,
                        shouldForce,
                    );
                    return Array.isArray(d.quotes) ? d.quotes : [];
                },
            },
            {
                key: 'reposts',
                label: 'リポスト',
                count: summaryData.counts?.reposts ?? (Array.isArray(summaryData.reposts) ? summaryData.reposts.length : undefined),
                type: 'users',
                emptyText: 'リポストしたユーザーはいません',
                fetch: async (shouldForce) => {
                    const d = await fetchTabItems(
                        `/server/api/posts/${normalizedPostId}/reposts`,
                        `${baseCacheKey}_reposts`,
                        shouldForce,
                    );
                    return Array.isArray(d.reposts) ? d.reposts : [];
                },
            },
        ];

        if (isAuthor) {
            tabs.push({
                key: 'likes',
                label: 'いいね',
                count: summaryData.counts?.likes ?? (Array.isArray(summaryData.likes) ? summaryData.likes.length : undefined),
                type: 'users',
                emptyText: 'いいねしたユーザーはいません',
                fetch: async (shouldForce) => {
                    const d = await fetchTabItems(
                        `/server/api/posts/${normalizedPostId}/likes`,
                        `${baseCacheKey}_likes`,
                        shouldForce,
                    );
                    return Array.isArray(d.likes) ? d.likes : [];
                },
            });
        }

        let targetTab = initialTab || 'quotes';
        if (!isAuthor && targetTab === 'likes') {
            targetTab = 'quotes';
        }
        if (targetTab === 'stars') {
            targetTab = 'quotes';
        }

        await setupTabbedListView(contentDiv, {
            routeHash: `#post/${normalizedPostId}/activity`,
            cacheKey: baseCacheKey,
            initialTab: targetTab,
            forceRefresh,
            resetScroll,
            tabs,
            onRefresh: async (activeTab) => {
                await showPostActivityScreen(normalizedPostId, activeTab, { forceRefresh: true, resetScroll: true }, showScreenFn);
            },
        });
    } catch (err) {
        console.error('[postActivityScreen] error:', err);
        contentDiv.innerHTML = `<div class="tab-empty-state" style="padding: 3rem 1rem; text-align: center; color: var(--secondary-text-color);"><p>${escapeHTML(err?.message || 'アクティビティの取得に失敗しました')}</p></div>`;
    } finally {
        showLoading(false);
    }
}

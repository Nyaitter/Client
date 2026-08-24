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
    const cacheKey = getPostActivityCacheKey(normalizedPostId);

    // 画面進入時は要素を一度消してローディングを表示
    if (!forceRefresh) {
        contentDiv.innerHTML = '<div class="spinner" style="margin: 3rem auto;"></div>';
    }

    const fetchActivityData = async (shouldForce = false) => {
        let cached = shouldForce ? null : getScreenDataCache(cacheKey);
        if (cached) return cached;
        const { data, error } = await apiRequest(`/server/api/posts/${normalizedPostId}/activity`);
        if (error || !data) {
            throw new Error(error || 'アクティビティの取得に失敗しました');
        }
        setScreenDataCache(cacheKey, data);
        return data;
    };

    try {
        const activityData = await fetchActivityData(forceRefresh);
        const isAuthor = Boolean(activityData.is_author);
        const quotes = Array.isArray(activityData.quotes) ? activityData.quotes : [];
        const reposts = Array.isArray(activityData.reposts) ? activityData.reposts : [];
        const likes = Array.isArray(activityData.likes) ? activityData.likes : [];
        const stars = Array.isArray(activityData.stars) ? activityData.stars : [];

        const tabs = [
            {
                key: 'quotes',
                label: '引用',
                count: quotes.length,
                type: 'posts',
                emptyText: '引用ポストはまだありません',
                fetch: async (shouldForce) => {
                    const d = await fetchActivityData(shouldForce);
                    return Array.isArray(d.quotes) ? d.quotes : [];
                },
            },
            {
                key: 'reposts',
                label: 'リポスト',
                count: reposts.length,
                type: 'users',
                emptyText: 'リポストしたユーザーはいません',
                fetch: async (shouldForce) => {
                    const d = await fetchActivityData(shouldForce);
                    return Array.isArray(d.reposts) ? d.reposts : [];
                },
            },
        ];

        if (isAuthor) {
            tabs.push({
                key: 'likes',
                label: 'いいね',
                count: likes.length,
                type: 'users',
                emptyText: 'いいねしたユーザーはいません',
                fetch: async (shouldForce) => {
                    const d = await fetchActivityData(shouldForce);
                    return Array.isArray(d.likes) ? d.likes : [];
                },
            });
            tabs.push({
                key: 'stars',
                label: 'お気に入り',
                count: stars.length,
                type: 'users',
                emptyText: 'お気に入り登録したユーザーはいません',
                fetch: async (shouldForce) => {
                    const d = await fetchActivityData(shouldForce);
                    return Array.isArray(d.stars) ? d.stars : [];
                },
            });
        }

        let targetTab = initialTab || 'quotes';
        if (!isAuthor && (targetTab === 'likes' || targetTab === 'stars')) {
            targetTab = 'quotes';
        }
        if (targetTab === 'quotes' && quotes.length === 0 && reposts.length > 0) {
            targetTab = 'reposts';
        } else if (targetTab === 'quotes' && quotes.length === 0 && reposts.length === 0 && isAuthor && likes.length > 0) {
            targetTab = 'likes';
        } else if (targetTab === 'quotes' && quotes.length === 0 && reposts.length === 0 && isAuthor && stars.length > 0) {
            targetTab = 'stars';
        }

        await setupTabbedListView(contentDiv, {
            routeHash: `#post/${normalizedPostId}/activity`,
            cacheKey,
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

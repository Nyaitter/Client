import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { apiRequest } from '../api.js';
import { renderPost } from '../modules/posts.js';
import { renderUserCard } from '../modules/pagination.js';
import { escapeHTML, showLoading } from '../utils/helpers.js';
import { initTabGroup } from '../modules/tabSwipe.js';
import {
    getPostActivityCacheKey,
    getScreenDataCache,
    setScreenDataCache,
    deleteScreenDataCache,
} from '../modules/cache.js';
import {
    getScrollRouteKey,
    saveScrollPosition,
    restoreScrollPosition,
    clearSavedScrollPosition,
} from '../modules/scroll.js';

let activeActivityPostId = null;

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

    const contentDiv = DOM.postActivityContent;
    const cacheKey = getPostActivityCacheKey(normalizedPostId);

    // すでに同じポストのアクティビティ画面が開かれており、再読み込み（PTRやタブ再クリック）の場合はリストのみ再取得・再描画
    const existingContainer = contentDiv.querySelector('.post-activity-screen-container');
    const isSamePostScreenOpen = activeActivityPostId === normalizedPostId && existingContainer;

    if (isSamePostScreenOpen && forceRefresh) {
        const bodyContainer = existingContainer.querySelector('#post-activity-screen-body');
        const tabsContainer = existingContainer.querySelector('#post-activity-screen-tabs');
        if (bodyContainer) {
            bodyContainer.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';
        }

        try {
            const { data, error } = await apiRequest(`/server/api/posts/${normalizedPostId}/activity`);
            if (error || !data) {
                if (bodyContainer) {
                    bodyContainer.innerHTML = `
                        <div class="post-activity-empty" style="padding: 2rem; text-align: center; color: var(--secondary-text-color);">
                            <p>${escapeHTML(error || 'アクティビティの取得に失敗しました')}</p>
                        </div>
                    `;
                }
                return;
            }

            setScreenDataCache(cacheKey, data);
            const isAuthor = Boolean(data.is_author);
            const quotes = Array.isArray(data.quotes) ? data.quotes : [];
            const reposts = Array.isArray(data.reposts) ? data.reposts : [];
            const likes = Array.isArray(data.likes) ? data.likes : [];
            const stars = Array.isArray(data.stars) ? data.stars : [];

            // タブのバッジ数字を最新に更新
            if (tabsContainer) {
                const quotesBtn = tabsContainer.querySelector('[data-tab="quotes"]');
                if (quotesBtn) quotesBtn.textContent = `引用 (${quotes.length})`;
                const repostsBtn = tabsContainer.querySelector('[data-tab="reposts"]');
                if (repostsBtn) repostsBtn.textContent = `リポスト (${reposts.length})`;
                const likesBtn = tabsContainer.querySelector('[data-tab="likes"]');
                if (likesBtn) likesBtn.textContent = `いいね (${likes.length})`;
                const starsBtn = tabsContainer.querySelector('[data-tab="stars"]');
                if (starsBtn) starsBtn.textContent = `お気に入り (${stars.length})`;
            }

            // リストを描画
            const activeTabBtn = tabsContainer?.querySelector('.tab-button.active');
            const targetTab = activeTabBtn ? activeTabBtn.dataset.tab : initialTab;
            await renderActivityList(bodyContainer, targetTab, { quotes, reposts, likes, stars });

            if (resetScroll) {
                window.scrollTo(0, 0);
            }
        } catch (err) {
            console.error('[postActivityScreen] refresh error:', err);
            if (bodyContainer) {
                bodyContainer.innerHTML = '<div class="post-activity-empty"><p>アクティビティの取得に失敗しました</p></div>';
            }
        }
        return;
    }

    activeActivityPostId = normalizedPostId;

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

    let activityData = forceRefresh ? null : getScreenDataCache(cacheKey);

    if (!activityData) {
        contentDiv.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';
    }

    try {
        if (!activityData) {
            const { data, error } = await apiRequest(`/server/api/posts/${normalizedPostId}/activity`);
            if (error || !data) {
                contentDiv.innerHTML = `
                    <div class="post-activity-empty" style="padding: 2rem; text-align: center; color: var(--secondary-text-color);">
                        <p>${escapeHTML(error || 'アクティビティの取得に失敗しました')}</p>
                    </div>
                `;
                showLoading(false);
                return;
            }
            activityData = data;
            setScreenDataCache(cacheKey, activityData);
        }

        const isAuthor = Boolean(activityData.is_author);
        let quotes = Array.isArray(activityData.quotes) ? activityData.quotes : [];
        let reposts = Array.isArray(activityData.reposts) ? activityData.reposts : [];
        let likes = Array.isArray(activityData.likes) ? activityData.likes : [];
        let stars = Array.isArray(activityData.stars) ? activityData.stars : [];

        let currentActiveTab = initialTab || 'quotes';
        if (!isAuthor && (currentActiveTab === 'likes' || currentActiveTab === 'stars')) {
            currentActiveTab = 'quotes';
        }

        if (currentActiveTab === 'quotes' && quotes.length === 0 && reposts.length > 0) {
            currentActiveTab = 'reposts';
        } else if (currentActiveTab === 'quotes' && quotes.length === 0 && reposts.length === 0 && isAuthor && likes.length > 0) {
            currentActiveTab = 'likes';
        } else if (currentActiveTab === 'quotes' && quotes.length === 0 && reposts.length === 0 && isAuthor && stars.length > 0) {
            currentActiveTab = 'stars';
        }

        contentDiv.innerHTML = `
            <div class="post-activity-screen-container">
                <div class="timeline-tabs-sticky-container">
                    <div class="timeline-tabs" id="post-activity-screen-tabs">
                        <button type="button" class="tab-button ${currentActiveTab === 'quotes' ? 'active' : ''}" data-tab="quotes">引用 (${quotes.length})</button>
                        <button type="button" class="tab-button ${currentActiveTab === 'reposts' ? 'active' : ''}" data-tab="reposts">リポスト (${reposts.length})</button>
                        ${isAuthor ? `
                        <button type="button" class="tab-button ${currentActiveTab === 'likes' ? 'active' : ''}" data-tab="likes">いいね (${likes.length})</button>
                        <button type="button" class="tab-button ${currentActiveTab === 'stars' ? 'active' : ''}" data-tab="stars">お気に入り (${stars.length})</button>
                        ` : ''}
                    </div>
                </div>
                <div class="post-activity-screen-body" id="post-activity-screen-body"></div>
            </div>
        `;

        const tabsContainer = contentDiv.querySelector('#post-activity-screen-tabs');
        const bodyContainer = contentDiv.querySelector('#post-activity-screen-body');

        const renderTab = async (tabName, shouldRestoreScroll = true) => {
            currentActiveTab = tabName;
            await renderActivityList(bodyContainer, tabName, { quotes, reposts, likes, stars });

            if (shouldRestoreScroll && !resetScroll) {
                const routeKey = getScrollRouteKey(`#post/${normalizedPostId}/activity`, tabName);
                restoreScrollPosition(routeKey);
            } else if (resetScroll) {
                window.scrollTo(0, 0);
            }
        };

        if (tabsContainer && bodyContainer) {
            initTabGroup({
                container: tabsContainer,
                tabSelector: '.tab-button',
                contentContainer: bodyContainer,
                getTabKey: (btn) => btn.dataset.tab,
                onTabChange: (tab) => {
                    const prevRouteKey = getScrollRouteKey(`#post/${normalizedPostId}/activity`, currentActiveTab);
                    saveScrollPosition(prevRouteKey);
                    renderTab(tab, true);
                },
                onRefresh: async () => {
                    deleteScreenDataCache(cacheKey);
                    await showPostActivityScreen(normalizedPostId, currentActiveTab, { forceRefresh: true, resetScroll: true }, showScreenFn);
                },
            });

            // タブ再度クリックで最新再読み込み（リストのみ更新） & スクロールトップ
            tabsContainer.querySelectorAll('.tab-button').forEach((btn) => {
                btn.addEventListener('click', async (e) => {
                    const tabKey = btn.dataset.tab;
                    if (tabKey === currentActiveTab) {
                        e.stopPropagation();
                        deleteScreenDataCache(cacheKey);
                        clearSavedScrollPosition(getScrollRouteKey(`#post/${normalizedPostId}/activity`, tabKey));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        await showPostActivityScreen(normalizedPostId, tabKey, { forceRefresh: true, resetScroll: true }, showScreenFn);
                    }
                });
            });
        }

        await renderTab(currentActiveTab, !resetScroll);
    } catch (err) {
        console.error('[postActivityScreen] error:', err);
        contentDiv.innerHTML = '<div class="post-activity-empty"><p>アクティビティの取得に失敗しました</p></div>';
    } finally {
        showLoading(false);
    }
}

async function renderActivityList(bodyContainer, tabName, data) {
    if (!bodyContainer) return;
    bodyContainer.innerHTML = '';
    const { quotes = [], reposts = [], likes = [], stars = [] } = data || {};

    if (tabName === 'quotes') {
        if (quotes.length === 0) {
            bodyContainer.innerHTML = '<div class="post-activity-empty"><p>引用ポストはまだありません</p></div>';
            return;
        }
        const list = document.createElement('div');
        list.className = 'post-activity-quotes-list';
        for (const q of quotes) {
            const el = await renderPost(q, q.author);
            if (el) list.appendChild(el);
        }
        bodyContainer.appendChild(list);
    } else {
        let userList = [];
        let emptyText = '';
        if (tabName === 'reposts') {
            userList = reposts;
            emptyText = 'リポストしたユーザーはいません';
        } else if (tabName === 'likes') {
            userList = likes;
            emptyText = 'いいねしたユーザーはいません';
        } else if (tabName === 'stars') {
            userList = stars;
            emptyText = 'お気に入り登録したユーザーはいません';
        }

        if (userList.length === 0) {
            bodyContainer.innerHTML = `<div class="post-activity-empty"><p>${emptyText}</p></div>`;
            return;
        }

        const list = document.createElement('div');
        list.className = 'post-activity-users-list';
        for (const u of userList) {
            const card = renderUserCard(u);
            if (card) list.appendChild(card);
        }
        bodyContainer.appendChild(list);
    }
}

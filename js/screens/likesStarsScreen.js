import { DOM } from '../dom.js';
import { getCurrentUser } from '../state.js';
import { getAuxiliaryPostPageCache } from '../modules/cache.js';
import { loadPostsWithPagination } from '../modules/pagination.js';
import { showLoading } from '../utils/helpers.js';

export async function showLikesScreen(showScreenFn = null) {
    DOM.pageHeader.innerHTML = `<h2 id="page-title">いいね</h2>`;
    if (typeof showScreenFn === 'function') {
        showScreenFn('likes-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('likes-screen')?.classList.remove('hidden');
    }

    DOM.likesContent.innerHTML = '';
    const user = getCurrentUser();
    if (!user) {
        DOM.likesContent.innerHTML =
            '<p style="padding: 2rem; text-align: center; color: var(--secondary-text-color);">ログインが必要です。</p>';
        showLoading(false);
        return;
    }

    const userScope = user.id ?? 'guest';
    await loadPostsWithPagination(DOM.likesContent, 'likes', {
        ids: user.like || [],
        pageCache: getAuxiliaryPostPageCache(
            `${userScope}:likes:${(user.like || []).join(',')}`,
        ),
    });
    showLoading(false);
}

export async function showStarsScreen(showScreenFn = null) {
    DOM.pageHeader.innerHTML = `<h2 id="page-title">お気に入り</h2>`;
    if (typeof showScreenFn === 'function') {
        showScreenFn('stars-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('stars-screen')?.classList.remove('hidden');
    }

    DOM.starsContent.innerHTML = '';
    const user = getCurrentUser();
    if (!user) {
        DOM.starsContent.innerHTML =
            '<p style="padding: 2rem; text-align: center; color: var(--secondary-text-color);">ログインが必要です。</p>';
        showLoading(false);
        return;
    }

    const userScope = user.id ?? 'guest';
    await loadPostsWithPagination(DOM.starsContent, 'stars', {
        ids: user.star || [],
        pageCache: getAuxiliaryPostPageCache(
            `${userScope}:stars:${(user.star || []).join(',')}`,
        ),
    });
    showLoading(false);
}

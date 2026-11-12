import { DOM } from '../dom.js';
import { getCurrentUser } from '../state.js';
import { getAuxiliaryPostPageCache } from '../modules/cache.js';
import { loadPostsWithPagination } from '../modules/pagination.js';
import { showLoading } from '../utils/helpers.js';
import { clearContent, renderHeader, renderLoggedOut } from './likesStars/view.js';
import { showScreenCompat } from '../screenManager.js';

export async function showLikesScreen(showScreenFn = null) {
    renderHeader('いいね');
    showScreenCompat('likes-screen', showScreenFn);

    clearContent(DOM.likesContent);
    const user = getCurrentUser();
    if (!user) {
        renderLoggedOut(DOM.likesContent);
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
    renderHeader('お気に入り');
    showScreenCompat('stars-screen', showScreenFn);

    clearContent(DOM.starsContent);
    const user = getCurrentUser();
    if (!user) {
        renderLoggedOut(DOM.starsContent);
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

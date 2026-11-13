import { t } from '../modules/i18n.js';
import { DOM } from '../dom.js';
import { getCurrentUser } from '../state.js';
import { getAuxiliaryPostPageCache } from '../modules/cache.js';
import { loadPostsWithPagination } from '../modules/pagination.js';
import { showLoading, escapeHTML } from '../utils/helpers.js';

import { showScreenCompat } from '../screenManager.js';

export async function showLikesScreen(showScreenFn = null) {
    renderHeader(t('nav.likes'));
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
    renderHeader(t('nav.stars'));
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

export function renderHeader(title) {
    DOM.pageHeader.innerHTML = `<h2 id="page-title" class="nui-heading">${escapeHTML(title)}</h2>`;
}

export function renderLoggedOut(content) {
    if (content) {
        content.innerHTML = `<p class="list-empty-message nui-empty-text">${t('common.login_required')}</p>`;
    }
}

export function clearContent(content) {
    content?.replaceChildren();
}

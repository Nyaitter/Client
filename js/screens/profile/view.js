import { t } from '../../modules/i18n.js';
import { DOM } from '../../dom.js';
import { ICONS } from '../../icons.js';
import { escapeHTML } from '../../utils/helpers.js';
import { isCurrentUserProfile } from '../../modules/cache.js';

export function renderHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-back-button">
            <button class="header-back-btn" data-action="history-back" aria-label="${t('admin.back_label')}">${ICONS.back}</button>
            <h2 id="page-title">
                <div id="page-title-main">${t('nav.profile')}</div>
                <small id="page-title-sub"></small>
            </h2>
        </div>`;
}

export function renderTabs(container, user, activeTab) {
    if (!container) return;
    const sharedGroups = Array.isArray(user?.groups) ? user.groups : [];
    const tabs = [
        { key: 'posts', name: t('composer.submit') },
        { key: 'replies', name: t('dm.reply_button') },
        { key: 'media', name: t('profileview.tab_media') },
        { key: 'likes', name: t('nav.likes') },
        { key: 'stars', name: t('nav.stars') },
        ...(isCurrentUserProfile(user)
            ? [{ key: 'scheduled', name: t('profileview.tab_scheduled') }]
            : []),
        ...sharedGroups.map((group) => ({
            key: `group:${group.id}`,
            name: group.name || t('nav.groups'),
            className: 'profile-group-tab',
            title: group.name || t('nav.groups'),
        })),
    ];
    container.classList.add('nui-tabs');
    container.setAttribute('data-nui', 'tabs');
    container.innerHTML = tabs.map((tab) => (
        `<button class="tab-button nui-tab ${tab.className || ''} ${tab.key === activeTab ? 'active is-active' : ''}" data-tab="${escapeHTML(tab.key)}" title="${escapeHTML(tab.title || tab.name)}">${escapeHTML(tab.name)}</button>`
    )).join('');
    return tabs;
}

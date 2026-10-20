import { DOM } from '../../dom.js';
import { ICONS } from '../../icons.js';
import { escapeHTML } from '../../utils/helpers.js';
import { isCurrentUserProfile } from '../../modules/cache.js';

export function renderHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-back-button">
            <button class="header-back-btn" data-action="history-back" aria-label="戻る">${ICONS.back}</button>
            <h2 id="page-title">
                <div id="page-title-main">プロフィール</div>
                <small id="page-title-sub"></small>
            </h2>
        </div>`;
}

export function renderTabs(container, user, activeTab) {
    if (!container) return;
    const sharedGroups = Array.isArray(user?.groups) ? user.groups : [];
    const tabs = [
        { key: 'posts', name: 'ポスト' },
        { key: 'replies', name: '返信' },
        { key: 'media', name: 'メディア' },
        { key: 'likes', name: 'いいね' },
        { key: 'stars', name: 'お気に入り' },
        ...(isCurrentUserProfile(user)
            ? [{ key: 'scheduled', name: '予約済み' }]
            : []),
        ...sharedGroups.map((group) => ({
            key: `group:${group.id}`,
            name: group.name || 'グループ',
            className: 'profile-group-tab',
            title: group.name || 'グループ',
        })),
    ];
    container.classList.add('nui-tabs');
    container.setAttribute('data-nui', 'tabs');
    container.innerHTML = tabs.map((tab) => (
        `<button class="tab-button nui-tab ${tab.className || ''} ${tab.key === activeTab ? 'active is-active' : ''}" data-tab="${escapeHTML(tab.key)}" title="${escapeHTML(tab.title || tab.name)}">${escapeHTML(tab.name)}</button>`
    )).join('');
    return tabs;
}

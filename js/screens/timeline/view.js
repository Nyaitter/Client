import { DOM } from '../../dom.js';
import { escapeHTML } from '../../utils/helpers.js';
import { ICONS } from '../../icons.js';

export function renderHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-back-button">
            <h2 id="page-title" class="nui-heading">ホーム</h2>
            <a href="#" class="home-header-logo" aria-label="ホーム">${ICONS.nyaitter_logo}</a>
        </div>`;
}

export function renderTabs(container, savedTabs, { joinedGroups = [], homeTabLimit = 0, guest = false } = {}) {
    if (!container) return;
    container.classList.add('nui-tabs');
    const visibleGroups = homeTabLimit > 0 ? joinedGroups.slice(0, homeTabLimit) : joinedGroups;
    const tabs = [];
    for (const tabKey of savedTabs) {
        if (tabKey === 'all') {
            tabs.push('<button class="timeline-tab-button" data-tab="all">すべて</button>');
        } else if (tabKey === 'foryou') {
            tabs.push('<button class="timeline-tab-button" data-tab="foryou">おすすめ</button>');
        } else if (tabKey === 'following' && !guest) {
            tabs.push('<button class="timeline-tab-button" data-tab="following">フォロー中</button>');
        } else if (tabKey === 'announce') {
            tabs.push('<button class="timeline-tab-button" data-tab="announce">お知らせ</button>');
        } else if (tabKey === 'groups' && !guest) {
            visibleGroups.forEach((group) => {
                const id = escapeHTML(String(group.id));
                const name = escapeHTML(group.name || '無題のグループ');
                tabs.push(`<button class="timeline-tab-button group-timeline-tab" data-tab="group:${id}" title="${name}" data-group-id="${id}"><span>${name}</span></button>`);
            });
        }
    }
    container.innerHTML = tabs.length > 0
        ? tabs.join('')
        : '<button class="timeline-tab-button" data-tab="foryou">おすすめ</button>';
}

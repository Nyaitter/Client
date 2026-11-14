import { t } from '../../modules/i18n.js';
import { getCurrentUser } from '../../state.js';
import { getGroupBadgesHtml, getGroupIconUrl, getNyaitterId, getUserIconUrl } from '../../utils/helpers.js';

export function selectedPostBadges(user) {
    const badges = Array.isArray(user?.group_badges)
        ? user.group_badges.filter((b) => b && b.id != null)
        : [];
    const saved = user?.settings?.display_group_badges;
    if (!Array.isArray(saved)) return badges.slice(0, 5);
    const byId = new Map(badges.map((b) => [String(b.id), b]));
    return saved.map((id) => byId.get(String(id))).filter(Boolean);
}

function getDragAfterElement(container, y, selector) {
    const draggableElements = [...container.querySelectorAll(`${selector}:not(.dragging)`)];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

export function bindSettingsProfileEditor(root, requestSave) {
    const heroRow = root.querySelector('#settings-profile-badges');
    const picker = root.querySelector('#settings-post-badges');
    if (!heroRow || !picker) return;
    const user = getCurrentUser();
    const badges = Array.isArray(user?.group_badges)
        ? user.group_badges.filter((b) => b && b.id != null)
        : [];

    heroRow.innerHTML = getGroupBadgesHtml(user, { maxCount: Infinity, all: true });

    const displayable = badges.filter((b) => getGroupIconUrl(b));
    if (!displayable.length) return;

    const byId = new Map(displayable.map((b) => [String(b.id), b]));
    let customized = Array.isArray(user?.settings?.display_group_badges);
    let zones = {
        shown: selectedPostBadges(user).filter((b) => byId.has(String(b.id))),
        hidden: displayable.filter(
            (b) => !selectedPostBadges(user).some((s) => String(s.id) === String(b.id)),
        ),
    };

    const createItemElement = (badge, zone) => {
        const item = document.createElement('div');
        item.className = 'side-menu-item nui-list-item';
        item.draggable = true;
        item.dataset.badgeId = JSON.stringify(badge.id);
        item.dataset.zone = zone;

        const main = document.createElement('div');
        main.className = 'side-menu-item-main';
        const handle = document.createElement('span');
        handle.className = 'side-menu-handle';
        handle.title = t('settings.menu.drag');
        handle.textContent = '⠿';
        const img = document.createElement('img');
        img.className = 'user-group-badge';
        img.src = getGroupIconUrl(badge);
        img.alt = '';
        const name = document.createElement('span');
        name.className = 'side-menu-name nui-list-title';
        name.textContent = badge.name || '';
        main.append(handle, img, name);

        const actions = document.createElement('div');
        actions.className = 'side-menu-actions nui-actions';
        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'side-menu-action-btn nui-button-secondary';
        up.dataset.action = 'move-up';
        up.title = t('settings.menu.up');
        up.textContent = '↑';
        const down = document.createElement('button');
        down.type = 'button';
        down.className = 'side-menu-action-btn nui-button-secondary';
        down.dataset.action = 'move-down';
        down.title = t('settings.menu.down');
        down.textContent = '↓';
        const zoneBtn = document.createElement('button');
        zoneBtn.type = 'button';
        zoneBtn.className = 'side-menu-action-btn nui-button-secondary';
        if (zone === 'shown') {
            zoneBtn.dataset.action = 'to-hidden';
            zoneBtn.title = t('settings.profile.post_badge_hide_title');
            zoneBtn.textContent = t('settings.profile.post_badge_hide');
        } else {
            zoneBtn.dataset.action = 'to-shown';
            zoneBtn.title = t('settings.profile.post_badge_show_title');
            zoneBtn.textContent = t('settings.profile.post_badge_show');
        }
        actions.append(up, down, zoneBtn);

        item.append(main, actions);
        return item;
    };

    const createZoneElement = (zone, titleKey, emptyKey) => {
        const zoneEl = document.createElement('div');
        zoneEl.className = 'side-menu-zone nui-section';
        zoneEl.dataset.zone = zone;
        const title = document.createElement('h4');
        title.className = 'side-menu-zone-title nui-section-title';
        title.textContent = t(titleKey);
        const list = document.createElement('div');
        list.className = 'side-menu-list nui-list';
        list.dataset.nui = 'list';
        list.dataset.zone = zone;
        list.dataset.emptyText = t(emptyKey);
        if (zone === 'shown') list.dataset.badgeShownList = '';
        zoneEl.append(title, list);
        return { zoneEl, list };
    };

    const shownZone = createZoneElement('shown', 'settings.profile.post_badges', 'settings.profile.post_badges_empty');
    const hiddenZone = createZoneElement('hidden', 'settings.profile.post_badges_hidden', 'settings.profile.post_badges_hidden_empty');
    const customizer = document.createElement('div');
    customizer.className = 'side-menu-customizer';
    customizer.append(shownZone.zoneEl, hiddenZone.zoneEl);
    const resetRow = document.createElement('div');
    resetRow.className = 'profile-edit-actions';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'nui-button-secondary';
    resetBtn.textContent = t('settings.profile.post_badges_reset');
    resetRow.append(resetBtn);

    const preview = document.createElement('div');
    preview.className = 'post-badge-preview';
    const previewLabel = document.createElement('div');
    previewLabel.className = 'post-badge-preview-label nui-section-title';
    previewLabel.textContent = t('settings.profile.post_badges_preview');
    const previewPost = document.createElement('article');
    previewPost.className = 'post';
    const previewIconLink = document.createElement('span');
    previewIconLink.className = 'user-icon-link';
    const previewIcon = document.createElement('img');
    previewIcon.className = 'user-icon nui-avatar';
    previewIcon.src = getUserIconUrl(user);
    previewIcon.alt = '';
    previewIconLink.appendChild(previewIcon);
    const previewMain = document.createElement('div');
    previewMain.className = 'post-main';
    const previewHeader = document.createElement('div');
    previewHeader.className = 'post-header';
    const previewAuthor = document.createElement('span');
    previewAuthor.className = 'post-author';
    const previewName = document.createElement('span');
    previewName.className = 'post-author-name';
    previewName.textContent = user?.name || '';
    previewAuthor.appendChild(previewName);
    const previewBadges = document.createElement('span');
    const previewTime = document.createElement('span');
    previewTime.className = 'post-time nui-list-meta';
    previewTime.textContent = user ? getNyaitterId(user) : '';
    previewHeader.append(previewAuthor, previewBadges, previewTime);
    const previewBody = document.createElement('div');
    previewBody.className = 'post-body';
    const previewContent = document.createElement('div');
    previewContent.className = 'post-content';
    previewContent.textContent = t('settings.profile.post_badges_preview_text');
    previewBody.appendChild(previewContent);
    previewMain.append(previewHeader, previewBody);
    previewPost.append(previewIconLink, previewMain);
    preview.append(previewLabel, previewPost);
    picker.append(preview, customizer, resetRow);

    const renderPreview = () => {
        previewBadges.innerHTML = getGroupBadgesHtml(
            { post_group_badges: zones.shown },
            { maxCount: Infinity },
        );
    };

    const render = () => {
        for (const [zone, list] of [['shown', shownZone.list], ['hidden', hiddenZone.list]]) {
            list.innerHTML = '';
            zones[zone].forEach((badge) => list.appendChild(createItemElement(badge, zone)));
        }
        shownZone.list.dataset.badgeMode = customized ? 'custom' : 'default';
        resetRow.hidden = !customized;
        renderPreview();
    };

    resetBtn.addEventListener('click', () => {
        customized = false;
        zones = { shown: displayable.slice(0, 5), hidden: displayable.slice(5) };
        render();
        requestSave?.();
    });

    const readZones = () => {
        const read = (list) => [...list.querySelectorAll(':scope > .side-menu-item')]
            .map((item) => byId.get(String(JSON.parse(item.dataset.badgeId))))
            .filter(Boolean);
        return { shown: read(shownZone.list), hidden: read(hiddenZone.list) };
    };

    const commit = (next) => {
        customized = true;
        zones = next;
        render();
        requestSave?.();
    };

    render();

    let draggedItem = null;
    const clearDragOver = () => {
        customizer.querySelectorAll('.side-menu-list').forEach((list) => list.classList.remove('drag-over'));
    };

    customizer.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.side-menu-item');
        if (!item) return;
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.badgeId);
    });

    customizer.addEventListener('dragend', () => {
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
        }
        clearDragOver();
        render();
    });

    customizer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const list = e.target.closest('.side-menu-list');
        if (!list) return;
        e.dataTransfer.dropEffect = 'move';
        clearDragOver();
        list.classList.add('drag-over');
        const afterElement = getDragAfterElement(list, e.clientY, '.side-menu-item');
        if (draggedItem) {
            if (afterElement == null) {
                list.appendChild(draggedItem);
            } else {
                list.insertBefore(draggedItem, afterElement);
            }
        }
    });

    customizer.addEventListener('dragleave', (e) => {
        const list = e.target.closest('.side-menu-list');
        if (list && !list.contains(e.relatedTarget)) {
            list.classList.remove('drag-over');
        }
    });

    customizer.addEventListener('drop', (e) => {
        e.preventDefault();
        clearDragOver();
        commit(readZones());
    });

    customizer.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn || actionBtn.disabled) return;
        const item = actionBtn.closest('.side-menu-item');
        if (!item) return;
        const badgeId = String(JSON.parse(item.dataset.badgeId));
        const action = actionBtn.dataset.action;

        const next = { shown: [...zones.shown], hidden: [...zones.hidden] };
        const fromZone = item.closest('.side-menu-list')?.dataset.zone === 'hidden' ? 'hidden' : 'shown';
        const keys = next[fromZone];
        const index = keys.findIndex((b) => String(b.id) === badgeId);
        if (index < 0) return;

        if (action === 'move-up' || action === 'move-down') {
            const target = action === 'move-up' ? index - 1 : index + 1;
            if (target < 0 || target >= keys.length) return;
            keys[target] = keys.splice(index, 1, keys[target])[0];
        } else if (action === 'to-hidden' || action === 'to-shown') {
            const toZone = action === 'to-shown' ? 'shown' : 'hidden';
            next[toZone].push(keys.splice(index, 1)[0]);
        } else {
            return;
        }
        commit(next);
    });
}

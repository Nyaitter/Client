import { t } from '../modules/i18n.js';
import { apiRequest } from '../api.js';
import { ICONS } from '../icons.js';
import { getCurrentUser } from '../state.js';
import { loadPostsWithPagination } from '../modules/pagination.js';
import { uploadFileViaEdgeFunction, deleteFilesViaEdgeFunction } from '../modules/posts.js';
import { initTabGroup } from '../modules/tabSwipe.js';

let groupPostsTabGroupController = null;
let groupManageTabGroupController = null;
import { createUserInvitePicker } from '../modules/userInvite.js';
import { escapeHTML, getNyaitterId, getSafeConfiguredFileUrl, getUserIconUrl, showAppAlert, showAppConfirm, showLoading } from '../utils/helpers.js';
import { rankAvatarAttributes } from '../modules/rankAvatarIntegration.js';
import { showScreenCompat } from '../screenManager.js';
import { copyEntityUrl } from '../modules/share.js';

const VISIBILITY_LABELS = {
    open: t('group.visibility.open'),
    open_invite: t('group.visibility.open_invite'),
    private: t('group.visibility.private'),
    invite: t('group.visibility.invite'),
};

const PERMISSION_CONFIG = [
    {
        id: 'admin',
        label: t('group.perm.all_label'),
        badge: t('group.perm.all_badge'),
        description: t('group.perm.all_desc'),
    },
    {
        id: 'profile',
        label: t('group.perm.profile_label'),
        description: t('group.perm.profile_desc'),
    },
    {
        id: 'invite',
        label: t('group.perm.invite_label'),
        description: t('group.perm.invite_desc'),
    },
    {
        id: 'ban',
        label: t('group.perm.ban_label'),
        description: t('group.perm.ban_desc'),
    },
    {
        id: 'post',
        label: t('group.perm.post_label'),
        description: t('group.perm.post_desc'),
    },
    {
        id: 'announce',
        label: t('timeline.tab.announcements'),
        description: t('group.perm.announce_desc'),
    },
    {
        id: 'delete',
        label: t('group.perm.delete_label'),
        description: t('group.perm.delete_desc'),
    },
];

function groupsContent() {
    return document.getElementById('groups-content');
}

function groupPath(groupId, suffix = '') {
    return `/server/api/groups/${encodeURIComponent(groupId)}${suffix}`;
}

async function request(path, options = {}) {
    const { data, error } = await apiRequest(path, options);
    if (error) throw error;
    return data || {};
}

function getRole(group) {
    const roleId = group?.membership?.role_id;
    return Array.isArray(group?.roles)
        ? group.roles.find((role) => String(role.id) === String(roleId)) || null
        : null;
}

function hasGroupPermission(group, permission) {
    const userId = Number(getCurrentUser()?.id);
    if (Number(group?.owner_id) === userId) return true;
    const permissions = getRole(group)?.permissions || [];
    return permissions.includes('admin') || permissions.includes(permission);
}

function isGroupAdmin(group) {
    return hasGroupPermission(group, 'admin');
}

function isGroupOwner(group) {
    return Number(group?.owner_id) === Number(getCurrentUser()?.id);
}

function getGroupImageUrl(value) {
    const image = typeof value === 'string' ? value.trim() : '';
    if (!image) return '';
    if (/^data:image\/(?:jpeg|png|gif|webp);base64,[a-z0-9+/]+=*$/i.test(image)) return image;
    if (/^https?:\/\/[^\s"'<>]+$/i.test(image)) return getSafeConfiguredFileUrl(image);
    const configuredUrl = globalThis.NyaitterClientConfig?.userFileUrl?.(image);
    const safeConfiguredUrl = getSafeConfiguredFileUrl(configuredUrl);
    if (safeConfiguredUrl) return safeConfiguredUrl;
    return /^attachments\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(image) && !image.includes('..') ? image : '';
}

function groupAvatar(group, className = 'nui-avatar') {
    const imageUrl = getGroupImageUrl(group?.icon_data);
    if (imageUrl) {
        return `<img class="${className}" src="${escapeHTML(imageUrl)}" alt="">`;
    }
    return `<div class="${className}" aria-hidden="true">${ICONS.group}</div>`;
}

function groupHeader(group) {
    const imageUrl = getGroupImageUrl(group?.header_image);
    if (!imageUrl) return '';
    return `<div class="nui-cover"><img src="${escapeHTML(imageUrl)}" alt=""></div>`;
}

function groupMeta(group) {
    const visibility = VISIBILITY_LABELS[group?.visibility] || t('group.visibility.open');
    return t('group.meta_line', { visibility, count: Number(group?.member_count || 0) });
}

function renderGroupCard(group, { joined = false } = {}) {
    const groupId = escapeHTML(String(group.id));
    const name = escapeHTML(group.name || t('post.group_untitled'));
    const description = escapeHTML(group.description || t('group.no_description'));
    return `<article class="nui-list-item" data-nui="list-item">
        <a class="nui-list-link" href="#group/${groupId}">
            ${groupAvatar(group)}
            <div class="nui-list-copy">
                <span class="nui-list-title">${name}${joined ? `<span class="nui-badge nui-badge-accent">${t('group.joined_badge')}</span>` : ''}</span>
                <p class="nui-list-meta">${groupMeta(group)}<br>${description}</p>
            </div>
        </a>
    </article>`;
}

function showScreen(showScreenFn) {
    showScreenCompat('groups-screen', showScreenFn);
}

function renderGroupSection(title, content, description = '', options = {}) {
    const feature = options.feature ? ` data-nui-feature="${escapeHTML(options.feature)}"` : '';
    const className = options.className ? ` ${escapeHTML(options.className)}` : '';
    return `<section class="nui-section${className}" data-nui="section"${feature}>
        <div class="nui-section-heading">
            <div><h4 class="nui-section-title">${escapeHTML(title)}</h4>${description ? `<p class="nui-help-text">${escapeHTML(description)}</p>` : ''}</div>
        </div>
        ${content}
    </section>`;
}

function imageDataUrlToFile(dataUrl) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(String(dataUrl || ''));
    if (!match) throw new Error(t('group.image_format_invalid'));
    const mimeType = match[1].toLowerCase();
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType] || 'png';
    return new File([bytes], `group-image.${extension}`, { type: mimeType });
}

async function resizeImageToDataUrl(file, maxWidth, maxHeight) {
    if (!file?.type?.startsWith('image/')) throw new Error(t('group.image_select_file'));
    const sourceDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error(t('group.image_load_failed')));
        reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(t('group.image_load_failed')));
        img.src = sourceDataUrl;
    });
    const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
    const outputType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? file.type : 'image/png';
    return canvas.toDataURL(outputType);
}

function isStoredImageId(value) {
    return typeof value === 'string' && value.trim() !== '' && !/^data:image\//i.test(value) && !/^https?:\/\//i.test(value);
}

function setModalIconPreview(container, source = '') {
    container.innerHTML = source
        ? `<img src="${escapeHTML(source)}" alt="${t('group.icon_preview_alt')}">`
        : `<span aria-hidden="true">${ICONS.group}</span>`;
}

function setModalHeaderPreview(container, source = '') {
    container.innerHTML = source
        ? `<img src="${escapeHTML(source)}" alt="${t('group.header_preview_alt')}">`
        : `<span>${t('group.header_select')}</span>`;
    container.classList.toggle('is-empty', !source);
}

function openGroupModal(group = null) {
    document.getElementById('group-edit-modal')?.remove();

    const editing = Boolean(group?.id);
    let newIconDataUrl = null;
    let newHeaderDataUrl = null;
    let resetIcon = false;
    let resetHeader = false;
    const modal = document.createElement('div');
    modal.id = 'group-edit-modal';
    modal.className = 'modal-overlay nui-modal-backdrop group-modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'group-modal-title');
    modal.innerHTML = `<div class="modal-content group-modal-content nui-modal" style="width: min(680px, calc(100vw - 2rem)); padding: 0;">
        <button type="button" class="modal-close-btn" aria-label="${t('common.close')}">×</button>
        <form id="group-modal-form" class="nui-form group-modal-form">
            <header class="group-modal-heading"><h3 id="group-modal-title" class="nui-modal-title">${editing ? t('group.edit_title') : t('group.create_title')}</h3><p class="nui-help-text">${editing ? t('group.modal_help_edit') : t('group.modal_help_create')}</p></header>
            <div class="group-edit-hero">
                <button type="button" class="group-edit-banner" id="group-header-picker" title="${t('group.header_select_title')}"></button>
                <input type="file" id="group-header-input" accept="image/*" class="hidden">
                <div class="group-edit-main">
                    <button type="button" class="group-edit-avatar" id="group-icon-picker" title="${t('group.icon_select_title')}"></button>
                    <input type="file" id="group-icon-input" accept="image/*" class="hidden">
                    <input name="name" class="group-edit-name" maxlength="100" required value="${escapeHTML(group?.name || '')}" placeholder="${t('group.name_label')}" aria-label="${t('group.name_label')}">
                </div>
            </div>
            ${editing ? `<div class="group-edit-actions"><button type="button" class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary" id="reset-group-icon">${t('group.icon_delete')}</button><button type="button" class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary" id="reset-group-header">${t('group.header_delete')}</button></div>` : ''}
            <label>${t('report.description_label')}<textarea name="description" class="nui-input" maxlength="2000" rows="4" placeholder="${t('group.description_placeholder')}">${escapeHTML(group?.description || '')}</textarea></label>
            <label>${t('group.visibility_label')}</label>
            ${renderVisibilityCards(group?.visibility || 'open')}
            <div class="settings-save-row"><button type="button" class="nui-button-secondary group-ui-secondary-button group-modal-cancel-button" data-nui="button-secondary" data-close-group-modal>${t('common.cancel')}</button><button type="submit" class="nui-button settings-primary-button" data-nui="button">${editing ? t('group.role_save') : t('common.create')}</button></div>
        </form>
    </div>`;
    document.body.append(modal);

    const form = modal.querySelector('#group-modal-form');
    const iconInput = modal.querySelector('#group-icon-input');
    const headerInput = modal.querySelector('#group-header-input');
    const iconPreview = modal.querySelector('#group-icon-picker');
    const headerPreview = modal.querySelector('#group-header-picker');
    setModalIconPreview(iconPreview, getGroupImageUrl(group?.icon_data));
    setModalHeaderPreview(headerPreview, getGroupImageUrl(group?.header_image));

    const closeModal = () => {
        document.removeEventListener('keydown', handleKeydown);
        modal.remove();
    };
    const handleKeydown = (event) => {
        if (event.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKeydown);
    modal.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);
    modal.querySelector('[data-close-group-modal]')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });

    iconPreview?.addEventListener('click', () => iconInput?.click());
    headerPreview?.addEventListener('click', () => headerInput?.click());
    iconInput?.addEventListener('change', async (event) => {
        try {
            const file = event.target.files?.[0];
            if (!file) return;
            newIconDataUrl = await resizeImageToDataUrl(file, 300, 300);
            resetIcon = false;
            setModalIconPreview(iconPreview, newIconDataUrl);
        } catch (error) {
            showAppAlert(error.message || t('group.icon_select_failed'));
        }
    });
    headerInput?.addEventListener('change', async (event) => {
        try {
            const file = event.target.files?.[0];
            if (!file) return;
            newHeaderDataUrl = await resizeImageToDataUrl(file, 1500, 600);
            resetHeader = false;
            setModalHeaderPreview(headerPreview, newHeaderDataUrl);
        } catch (error) {
            showAppAlert(error.message || t('group.header_select_failed'));
        }
    });
    form?.querySelectorAll('input[name="visibility"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            form.querySelectorAll('.group-visibility-card').forEach((card) => {
                card.classList.toggle('is-selected', card.dataset.visibilityCard === radio.value);
            });
        });
    });
    modal.querySelector('#reset-group-icon')?.addEventListener('click', () => {
        resetIcon = true;
        newIconDataUrl = null;
        if (iconInput) iconInput.value = '';
        setModalIconPreview(iconPreview);
    });
    modal.querySelector('#reset-group-header')?.addEventListener('click', () => {
        resetHeader = true;
        newHeaderDataUrl = null;
        if (headerInput) headerInput.value = '';
        setModalHeaderPreview(headerPreview);
    });

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const values = new FormData(form);
        const body = {
            name: values.get('name'),
            description: values.get('description'),
            visibility: values.get('visibility'),
        };
        const uploadedFileIds = [];
        const previousFileIds = new Set();
        try {
            showLoading(true);
            if (resetIcon) {
                body.icon_data = null;
            } else if (newIconDataUrl) {
                const fileId = await uploadFileViaEdgeFunction(imageDataUrlToFile(newIconDataUrl), {
                    replaceId: editing && isStoredImageId(group?.icon_data) ? group.icon_data : null,
                });
                if (!editing || !isStoredImageId(group?.icon_data)) uploadedFileIds.push(fileId);
                body.icon_data = fileId;
            }
            if (resetHeader) {
                body.header_image = null;
            } else if (newHeaderDataUrl) {
                const fileId = await uploadFileViaEdgeFunction(imageDataUrlToFile(newHeaderDataUrl), {
                    replaceId: editing && isStoredImageId(group?.header_image) ? group.header_image : null,
                });
                if (!editing || !isStoredImageId(group?.header_image)) uploadedFileIds.push(fileId);
                body.header_image = fileId;
            }
            if (resetIcon && isStoredImageId(group?.icon_data)) previousFileIds.add(group.icon_data);
            if (resetHeader && isStoredImageId(group?.header_image)) previousFileIds.add(group.header_image);

            const data = await request(editing ? groupPath(group.id) : '/server/api/groups', {
                method: editing ? 'PATCH' : 'POST',
                body,
            });
            const savedGroup = data.group;
            closeModal();
            if (previousFileIds.size > 0) {
                void deleteFilesViaEdgeFunction([...previousFileIds]).catch((error) => {
                    console.warn('グループの古い画像を削除できませんでした。', error);
                });
            }
            if (!savedGroup?.id) throw new Error(t('group.updated_fetch_failed'));
            if (editing) {
                await showGroupDetailScreen(savedGroup.id, 'manage');
            } else {
                window.location.hash = `#group/${savedGroup.id}`;
            }
        } catch (error) {
            if (uploadedFileIds.length > 0) {
                await deleteFilesViaEdgeFunction(uploadedFileIds).catch(() => {});
            }
            showAppAlert(error.message || (editing ? t('group.update_failed') : t('group.create_failed')));
        } finally {
            showLoading(false);
        }
    });

    requestAnimationFrame(() => form?.querySelector('[name="name"]')?.focus());
}

const PUBLIC_GROUP_PAGE_SIZE = 30;

function setupPublicGroupScroll(content, joinedIds, initialCount) {
    if (initialCount < PUBLIC_GROUP_PAGE_SIZE) return;
    const list = content.querySelector('#group-public-list');
    if (!list) return;
    let offset = initialCount;
    let loading = false;
    let done = false;
    const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    const loadMore = async () => {
        if (loading || done || !list.isConnected) return;
        loading = true;
        try {
            const data = await request(`/server/api/groups?limit=${PUBLIC_GROUP_PAGE_SIZE}&offset=${offset}`);
            const more = Array.isArray(data.groups) ? data.groups : [];
            offset += more.length;
            if (more.length) {
                list.insertAdjacentHTML('beforeend', more.map((group) => renderGroupCard(group, { joined: joinedIds.has(String(group.id)) })).join(''));
            }
            done = more.length < PUBLIC_GROUP_PAGE_SIZE;
        } catch {
            // 失敗したページは、次に末尾へ寄ったときに取り直す
        } finally {
            loading = false;
        }
        // リストに余白が残っている間は続けて読み込む
        if (!done && nearBottom()) void loadMore();
    };
    list.addEventListener('scroll', () => {
        if (nearBottom()) void loadMore();
    }, { passive: true });
    if (nearBottom()) void loadMore();
}

export async function showGroupsScreen(showScreenFn = null) {
    if (!getCurrentUser()) {
        window.location.hash = '#';
        return;
    }
    document.getElementById('page-header').innerHTML = `<h2 id="page-title">${t('nav.groups')}</h2>`;
    showScreen(showScreenFn);
    const content = groupsContent();
    if (!content) return;
    content.innerHTML = '<div class="group-screen-loading"><div class="spinner"></div></div>';
    try {
        const [mineData, publicData, inviteData] = await Promise.all([
            request('/server/api/groups/mine?limit=200'),
            request(`/server/api/groups?limit=${PUBLIC_GROUP_PAGE_SIZE}&offset=0`),
            request('/server/api/groups/invites/mine'),
        ]);
        const joinedGroups = Array.isArray(mineData.groups) ? mineData.groups : [];
        const publicGroups = Array.isArray(publicData.groups) ? publicData.groups : [];
        const invites = Array.isArray(inviteData.invites) ? inviteData.invites : [];
        const joinedIds = new Set(joinedGroups.map((group) => String(group.id)));
        content.innerHTML = `<main class="nui-page group-ui-page group-ui-index-page" data-nui="page">
            <header class="nui-page-heading settings-detail-heading group-ui-page-heading" data-nui="page-heading">
                <div><h3>${t('nav.groups')}</h3><p class="nui-help-text settings-group-description">${t('group.list_description')}</p></div>
                <button type="button" class="nui-button settings-primary-button" data-nui="button" id="open-create-group" data-nui-feature="groupCreate">${t('group.create_title')}</button>
            </header>
            ${invites.length ? renderGroupSection(t('group.invites_section'), `<div class="nui-list">${invites.map((invite) => `<article class="nui-list-item nui-row" data-nui="list-item"><div class="nui-list-copy"><span class="nui-list-title">${escapeHTML(invite.group?.name || t('nav.groups'))}</span><p class="nui-list-meta">${t('group.invite_received_text')}</p></div><div class="nui-actions"><button type="button" class="nui-button settings-primary-button" data-nui="button" data-group-invite="${escapeHTML(String(invite.id))}" data-decision="accept">${t('group.join_short')}</button><button type="button" class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary" data-group-invite="${escapeHTML(String(invite.id))}" data-decision="decline">${t('group.decline')}</button></div></article>`).join('')}</div>`, '', { feature: 'groupInvites', className: 'group-invites-section' }) : ''}
            ${renderGroupSection(t('group.joined_section'), joinedGroups.length ? `<div class="nui-list">${joinedGroups.map((group) => renderGroupCard(group, { joined: true })).join('')}</div>` : `<p class="nui-empty-text">${t('group.no_joined_groups')}</p>`, '', { className: 'group-joined-section' })}
            ${renderGroupSection(t('group.public_section'), publicGroups.length ? `<div class="nui-list group-public-list" id="group-public-list">${publicGroups.map((group) => renderGroupCard(group, { joined: joinedIds.has(String(group.id)) })).join('')}</div>` : `<p class="nui-empty-text">${t('group.no_public_groups')}</p>`, '', { feature: 'groupDiscovery', className: 'group-public-section' })}
        </main>`;
        bindGroupsIndexEvents();
        setupPublicGroupScroll(content, joinedIds, publicGroups.length);
    } catch (error) {
        content.innerHTML = `<p class="nui-empty-text">${t('group.load_failed')}${escapeHTML(error.message || '')}</p>`;
    } finally {
        showLoading(false);
    }
}

function bindGroupsIndexEvents() {
    document.getElementById('open-create-group')?.addEventListener('click', () => openGroupModal());
    document.querySelectorAll('[data-group-invite]').forEach((button) => button.addEventListener('click', async () => {
        try {
            showLoading(true);
            await request(`/server/api/groups/invites/${encodeURIComponent(button.dataset.groupInvite)}/respond`, { method: 'POST', body: { decision: button.dataset.decision } });
            await showGroupsScreen();
        } catch (error) {
            showAppAlert(error.message || t('group.invite_process_failed'));
        } finally {
            showLoading(false);
        }
    }));
}

export async function showGroupDetailScreen(groupId, section = 'overview', showScreenFn = null, initialManageTab = null) {
    if (!getCurrentUser()) {
        window.location.hash = '#';
        return;
    }
    stopGroupMembersScroll();
    showScreen(showScreenFn);
    const content = groupsContent();
    if (!content) return;
    content.innerHTML = '<div class="group-screen-loading"><div class="spinner"></div></div>';
    try {
        const data = await request(groupPath(groupId));
        const group = data.group;
        if (!group) throw new Error(t('group.not_found'));
        document.getElementById('page-header').innerHTML = `<div class="header-with-back-button"><button class="header-back-btn" type="button" id="group-back-btn">${ICONS.back}</button><h2 id="page-title">${escapeHTML(group.name || t('nav.groups'))}</h2></div>`;
        document.getElementById('group-back-btn')?.addEventListener('click', () => { window.location.hash = '#groups'; });
        if (section === 'manage') await renderGroupManage(content, group, initialManageTab || 'profile');
        else renderGroupOverview(content, group, data.join_request || null);
    } catch (error) {
        content.innerHTML = `<p class="nui-empty-text">${t('group.detail_load_failed')}${escapeHTML(error.message || '')}</p>`;
    } finally {
        showLoading(false);
    }
}

function roleDisplayName(role) {
    if (!role) return '';
    const type = getDefaultRoleType(role);
    const name = String(role.name || '').trim();
    if (type && DEFAULT_ROLE_LABELS[type] && (!name || name === type)) return DEFAULT_ROLE_LABELS[type];
    return name || t('group.role_untitled');
}

function groupPanelHeading(title) {
    return `<div class="nui-section-heading"><h4 class="nui-section-title">${escapeHTML(title)}</h4></div>`;
}

function renderGroupOverview(content, group, pendingJoinRequest = null) {
    const membership = group.membership;
    const isActive = membership?.status === 'active';
    const myRole = isActive ? getRole(group) : null;
    const hasPendingJoinRequest = Boolean(pendingJoinRequest);
    const isApprovalRequired = group.visibility === 'open_invite' || group.visibility === 'invite';
    const canJoin = !membership || (membership.status === 'pending' && !isApprovalRequired);
    const canManage = isGroupAdmin(group) || hasGroupPermission(group, 'profile') || hasGroupPermission(group, 'invite') || hasGroupPermission(group, 'ban');
    const groupId = escapeHTML(String(group.id));
    const joinBtnText = isApprovalRequired ? t('group.join_request_button') : t('group.join_button');
    content.innerHTML = `<main class="nui-page group-ui-page" data-nui="page">
        <section class="nui-card profile-hero" data-nui="card">
            ${groupHeader(group)}
            <div class="profile-hero-main">
                ${groupAvatar(group, 'nui-avatar profile-hero-avatar')}
                <div class="profile-hero-copy"><h3>${escapeHTML(group.name || '')}</h3><p class="nui-help-text settings-group-description">${groupMeta(group)}</p><p>${escapeHTML(group.description || t('group.no_description'))}</p>${myRole ? `<p class="group-my-role"><span class="nui-badge nui-badge-accent">${escapeHTML(roleDisplayName(myRole))}</span></p>` : ''}</div>
                <div class="profile-hero-actions">
                    ${canJoin && !hasPendingJoinRequest ? `<button type="button" class="nui-button settings-primary-button" data-nui="button" id="join-group-btn">${joinBtnText}</button>` : ''}
                    ${hasPendingJoinRequest ? `<button type="button" class="nui-button settings-primary-button" data-nui="button" disabled aria-disabled="true">${t('group.pending_approval')}</button>` : ''}
                    ${membership?.status === 'invited' ? `<span class="nui-badge nui-badge-accent">${t('group.invited_respond')}</span>` : ''}
                    ${isActive && !isGroupOwner(group) ? `<button type="button" class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary" id="leave-group-btn">${t('group.leave_button')}</button>` : ''}
                    ${canManage ? `<a class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary" href="#group/${groupId}/manage">${t('nav.settings')}</a>` : ''}
                    <button type="button" class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary" id="share-group-btn" title="${t('group.share_title')}">${ICONS.share}<span>${t('group.share_text')}</span></button>
                </div>
            </div>
        </section>
        ${isActive ? `<section class="nui-section group-ui-posts"><div class="timeline-tabs-sticky-container group-ui-post-tabs"><div class="timeline-tabs nui-tabs" role="tablist" aria-label="${t('group.posts_view_label')}"><button type="button" class="group-post-tab-button active" data-group-post-mode="all" role="tab" aria-selected="true">${t('timeline.tab.all')}</button><button type="button" class="group-post-tab-button" data-group-post-mode="recommended" role="tab" aria-selected="false">${t('timeline.tab.recommended')}</button><button type="button" class="group-post-tab-button" data-group-post-mode="announcements" role="tab" aria-selected="false">${t('timeline.tab.announcements')}</button></div></div><div id="group-detail-posts"></div></section>` : `<p class="nui-empty-text">${t('group.posts_members_only')}</p>`}
    </main>`;
    if (isActive) {
        const postContainer = content.querySelector('#group-detail-posts');
        const tabsEl = content.querySelector('.group-ui-post-tabs .timeline-tabs');
        const loadGroupPosts = (mode = 'all') => {
            if (!postContainer) return;
            postContainer.replaceChildren();
            void loadPostsWithPagination(postContainer, 'group_posts', { groupId: group.id, mode });
        };
        if (tabsEl) {
            groupPostsTabGroupController?.destroy();
            groupPostsTabGroupController = initTabGroup({
                container: tabsEl,
                tabSelector: '[data-group-post-mode]',
                contentContainer: postContainer,
                getTabKey: (btn) => btn.dataset.groupPostMode || 'all',
                onTabChange: (mode) => loadGroupPosts(mode),
            });
        }
        loadGroupPosts('all');
    }
    document.getElementById('join-group-btn')?.addEventListener('click', () => joinGroup(group));
    document.getElementById('leave-group-btn')?.addEventListener('click', () => leaveGroup(group));
    const shareButton = document.getElementById('share-group-btn');
    shareButton?.addEventListener('click', () => {
        void copyEntityUrl('group', group.id).catch(error => showAppAlert(error.message || t('group.share_failed')));
    });
}

async function joinGroup(group) {
    try {
        showLoading(true);
        const data = await request(groupPath(group.id, '/join'), { method: 'POST', body: {} });
        if (data.pending) await showAppAlert(t('group.join_request_sent'));
        await showGroupDetailScreen(group.id);
    } catch (error) {
        showAppAlert(error.message || t('group.join_failed'));
    } finally {
        showLoading(false);
    }
}

async function leaveGroup(group) {
    if (!await showAppConfirm(t('group.leave_confirm'))) return;
    try {
        showLoading(true);
        await request(groupPath(group.id, '/leave'), { method: 'POST', body: {} });
        await showGroupDetailScreen(group.id);
    } catch (error) {
        showAppAlert(error.message || t('group.leave_failed'));
    } finally {
        showLoading(false);
    }
}

const VISIBILITY_CONFIG = [
    {
        id: 'open',
        label: t('group.visibility.open'),
        description: t('group.visibility.open_desc'),
    },
    {
        id: 'open_invite',
        label: t('group.visibility.open_invite'),
        description: t('group.visibility.open_invite_desc'),
    },
    {
        id: 'private',
        label: t('group.visibility.private'),
        description: t('group.visibility.private_desc'),
    },
    {
        id: 'invite',
        label: t('group.visibility.invite'),
        description: t('group.visibility.invite_desc'),
    },
];

function renderVisibilityCards(currentVisibility = 'open') {
    return `<div class="group-visibility-grid" role="radiogroup" aria-label="${t('group.visibility_label')}">
        ${VISIBILITY_CONFIG.map((vis) => {
            const isSelected = vis.id === currentVisibility;
            return `<label class="group-visibility-card ${isSelected ? 'is-selected' : ''}" data-visibility-card="${vis.id}">
                <input type="radio" name="visibility" value="${vis.id}" ${isSelected ? 'checked' : ''}>
                <div class="group-visibility-card-header">
                    <span>${escapeHTML(vis.label)}</span>
                </div>
                <p class="group-visibility-card-desc">${escapeHTML(vis.description)}</p>
            </label>`;
        }).join('')}
    </div>`;
}

function renderGroupProfileForm(group) {
    const iconUrl = getGroupImageUrl(group?.icon_data);
    const headerUrl = getGroupImageUrl(group?.header_image);
    const currentVis = group?.visibility || 'open';
    return `<form id="group-profile-form" class="nui-form group-profile-form" data-nui="form">
        <div class="group-edit-hero">
            <button type="button" class="group-edit-banner ${headerUrl ? '' : 'is-empty'}" id="group-profile-header-picker" title="${t('group.image_picker_title')}">${headerUrl ? `<img src="${escapeHTML(headerUrl)}" alt="${t('group.header_preview_alt')}">` : `<span>${t('group.header_select')}</span>`}</button>
            <input type="file" id="group-profile-header-input" accept="image/*" class="hidden">
            <div class="group-edit-main">
                <button type="button" class="group-edit-avatar" id="group-profile-icon-picker" title="${t('group.image_picker_title')}">${iconUrl ? `<img src="${escapeHTML(iconUrl)}" alt="${t('group.icon_preview_alt')}">` : `<span aria-hidden="true">${ICONS.group}</span>`}</button>
                <input type="file" id="group-profile-icon-input" accept="image/*" class="hidden">
                <input id="group-profile-name" name="name" class="group-edit-name" maxlength="100" required value="${escapeHTML(group?.name || '')}" aria-label="${t('group.name_label')}">
            </div>
        </div>
        <div class="group-edit-actions">
            <button type="button" class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary" id="reset-group-profile-icon">${t('group.icon_delete')}</button>
            <button type="button" class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary" id="reset-group-profile-header">${t('group.header_delete')}</button>
        </div>
        <label for="group-profile-description">${t('report.description_label')}</label>
        <textarea id="group-profile-description" name="description" class="nui-input" maxlength="2000" rows="4" placeholder="${t('group.description_placeholder')}">${escapeHTML(group?.description || '')}</textarea>
        <label>${t('group.visibility_label')}</label>
        ${renderVisibilityCards(currentVis)}
        <p class="nui-help-text group-profile-save-status" id="group-profile-save-status" role="status" aria-live="polite">${t('group.autosave_note')}</p>
    </form>`;
}

const DEFAULT_ROLE_SORT_ORDERS = { owner: 0, admin: 1, member: 2 };
const DEFAULT_ROLE_LABELS = { owner: t('group.role_owner'), admin: t('group.role_admin'), member: t('group.role_member') };

function getDefaultRoleType(role) {
    if (!Boolean(role?.is_system ?? role?.isSystem)) return null;
    const sortOrder = Number(role?.sort_order ?? role?.sortOrder);
    return Object.entries(DEFAULT_ROLE_SORT_ORDERS).find(([, value]) => value === sortOrder)?.[0]
        || Object.keys(DEFAULT_ROLE_SORT_ORDERS).find((type) => role?.name === type)
        || 'system';
}

function renderRolePermissionCards(role = null) {
    const assignedPermissions = new Set(Array.isArray(role?.permissions) ? role.permissions : []);
    return PERMISSION_CONFIG.map((perm) => {
        const isChecked = assignedPermissions.has(perm.id);
        return `<label class="group-perm-row nui-toggle">
            <span class="group-perm-copy">
                <span class="group-perm-title"><strong>${escapeHTML(perm.label)}</strong>${perm.badge ? `<span class="nui-badge">${escapeHTML(perm.badge)}</span>` : ''}</span>
                <span class="nui-help-text">${escapeHTML(perm.description)}</span>
            </span>
            <input type="checkbox" name="permissions" value="${escapeHTML(perm.id)}" ${isChecked ? 'checked' : ''} class="nui-toggle-input group-role-perm-checkbox" role="switch">
            <span class="nui-toggle-track" aria-hidden="true"><span class="nui-toggle-thumb"></span></span>
        </label>`;
    }).join('');
}

function renderRoleChips(role, isOwner) {
    if (isOwner) {
        return `<span class="nui-badge nui-badge-accent">${t('group.role_all_permissions')}</span>`;
    }
    const permissions = Array.isArray(role?.permissions) ? role.permissions : [];
    if (permissions.includes('admin')) {
        return `<span class="nui-badge nui-badge-accent">${t('group.role_all_permissions')}</span>`;
    }
    if (permissions.length === 0) {
        return `<span class="nui-badge">${t('group.role_no_permissions')}</span>`;
    }
    return permissions.map((permId) => {
        const perm = PERMISSION_CONFIG.find((p) => p.id === permId);
        const label = perm?.label || permId;
        return `<span class="nui-badge">${escapeHTML(label)}</span>`;
    }).join('');
}

function renderRoleCard(role) {
    const roleId = escapeHTML(String(role.id));
    const roleType = getDefaultRoleType(role);
    const ownerRole = roleType === 'owner';
    const defaultRole = Boolean(roleType);
    const roleName = escapeHTML(role.name || t('group.role_untitled'));

    return `<article class="group-role-row ${ownerRole ? 'is-owner-role' : ''}" id="role-card-${roleId}" data-role-id="${roleId}">
        <div class="group-role-summary">
            <div class="group-role-summary-main">
                <div class="group-role-title-row">
                    <h5 class="group-role-title" data-role-title="${roleId}">${escapeHTML(roleDisplayName(role))}</h5>
                    ${defaultRole ? '' : `<span class="nui-badge">${t('group.role_custom')}</span>`}
                </div>
                <div class="group-role-perm-preview" data-role-preview="${roleId}">
                    ${renderRoleChips(role, ownerRole)}
                </div>
            </div>
            <div class="nui-actions group-role-summary-actions">
                ${ownerRole ? `<span class="nui-help-text">${t('group.role_locked')}</span>` : `
                    <button type="button" class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary" data-toggle-role="${roleId}" aria-expanded="false" aria-controls="role-editor-${roleId}">
                        ${t('post.edit')}
                    </button>
                    ${defaultRole ? '' : `<button type="button" class="nui-button-danger" data-nui="button-danger" data-delete-role="${roleId}" aria-label="${t('group.role_delete_aria', { name: roleName })}">${t('post.delete')}</button>`}
                `}
            </div>
        </div>
        ${ownerRole ? '' : `
        <div class="group-role-editor-pane hidden" id="role-editor-${roleId}">
            <form class="group-role-edit-form nui-form" data-nui="form" data-edit-group-role="${roleId}">
                <div class="nui-field">
                    <label for="role-name-${roleId}">${t('group.role_name_label')}</label>
                    <input id="role-name-${roleId}" name="name" maxlength="50" required value="${roleName}" class="nui-input">
                </div>
                <div class="group-role-perm-section">
                    <div class="group-role-perm-header">
                        <span class="group-role-input-label">${t('group.role_actions_label')}</span>
                        <span class="nui-help-text">${t('group.role_actions_hint_edit')}</span>
                    </div>
                    <div class="group-perm-list">
                        ${renderRolePermissionCards(role)}
                    </div>
                </div>
                <div class="group-role-card-actions">
                    <span class="group-role-save-status" id="save-status-${roleId}" role="status" aria-live="polite"></span>
                    <button type="button" class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary" data-cancel-role="${roleId}">${t('common.close')}</button>
                    <button type="submit" class="nui-button settings-primary-button group-role-save-btn" data-nui="button">${t('group.role_save')}</button>
                </div>
            </form>
        </div>
        `}
    </article>`;
}

function renderRolesPanel(group) {
    const roles = Array.isArray(group.roles) ? group.roles : [];
    return `<div class="group-roles-container">
        <div class="nui-toolbar group-roles-toolbar">
            <p class="nui-help-text">${t('group.roles_intro')}</p>
            <button type="button" class="nui-button settings-primary-button" data-nui="button" id="toggle-create-role-btn">
                ${t('group.role_add')}
            </button>
        </div>

        <div id="group-role-create-wrapper" class="group-role-create-wrapper hidden">
            <form id="group-role-form" class="group-role-edit-form nui-form" data-nui="form">
                <div class="group-role-create-header">
                    <h5 class="nui-section-title">${t('group.role_create_title')}</h5>
                    <button type="button" class="modal-close-btn" id="cancel-create-role-btn" aria-label="${t('common.close')}">×</button>
                </div>
                <div class="nui-field">
                    <label for="create-role-name">${t('group.role_name_label')}</label>
                    <input id="create-role-name" name="name" maxlength="50" required placeholder="${t('group.role_name_placeholder')}" class="nui-input">
                </div>
                <div class="group-role-perm-section">
                    <div class="group-role-perm-header">
                        <span class="group-role-input-label">${t('group.role_actions_label')}</span>
                        <span class="nui-help-text">${t('group.role_actions_hint_create')}</span>
                    </div>
                    <div class="group-perm-list">
                        ${renderRolePermissionCards()}
                    </div>
                </div>
                <div class="group-role-card-actions">
                    <button type="button" class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary" id="cancel-create-role-btn-action">${t('common.cancel')}</button>
                    <button type="submit" class="nui-button settings-primary-button" data-nui="button">${t('group.role_create_title')}</button>
                </div>
            </form>
        </div>

        <div class="group-role-list">
            ${roles.map((role) => renderRoleCard(role)).join('')}
        </div>
    </div>`;
}

const MEMBER_PAGE_SIZE = 50;
let groupMembersObserver = null;
let groupMembersScrollHandler = null;

function stopGroupMembersScroll() {
    groupMembersObserver?.disconnect();
    groupMembersObserver = null;
    if (groupMembersScrollHandler) {
        window.removeEventListener('scroll', groupMembersScrollHandler, { capture: true });
        groupMembersScrollHandler = null;
    }
}

function renderGroupMemberRow(entry, group) {
    const roles = Array.isArray(group.roles) ? group.roles : [];
    const canAdmin = isGroupAdmin(group);
    const canBan = hasGroupPermission(group, 'ban');
    const member = entry.membership || {};
    const user = entry.user || {};
    const owner = Number(member.user_id) === Number(group.owner_id);
    const memberName = escapeHTML(user.name || t('dm.user_number', { id: member.user_id }));
    const handle = escapeHTML(getNyaitterId(user) || `#${member.user_id}`);
    const avatarUrl = getUserIconUrl(user);
    return `<article class="nui-list-item nui-row group-member-item" data-nui="list-item" data-member-id="${Number(member.user_id)}" data-member-search-text="${escapeHTML((user.name || '').toLowerCase())} ${String(member.user_id)}">
        <div class="group-member-info">
            <img ${rankAvatarAttributes(user)} src="${escapeHTML(avatarUrl)}" class="nui-avatar group-member-avatar" alt="">
            <div class="group-member-details">
                <div class="group-member-name-row">
                    <span class="group-member-name">${memberName}</span>
                    ${owner ? `<span class="nui-badge nui-badge-accent">${t('group.role_owner')}</span>` : ''}
                </div>
                <span class="group-member-handle">${handle}</span>
            </div>
        </div>
        <div class="nui-actions group-member-actions">
            ${canAdmin && !owner ? `<select class="settings-select group-ui-role-select nui-input" data-member-role="${Number(member.user_id)}" aria-label="${t('group.member_role_aria', { name: memberName })}">${roles.map((role) => `<option value="${escapeHTML(String(role.id))}" ${String(role.id) === String(member.role_id) ? 'selected' : ''}>${escapeHTML(roleDisplayName(role))}</option>`).join('')}</select>` : ''}
            ${canBan && !owner ? `<button type="button" class="nui-button-danger settings-session-revoke-button" data-nui="button-danger" data-ban-member="${Number(member.user_id)}" aria-label="${t('group.member_ban_aria', { name: memberName })}">${t('group.ban_button')}</button>` : ''}
        </div>
    </article>`;
}

function renderManageTabs(group, { canProfile, canMembers, canInvite, canAdmin, canTransfer }) {
    const tabs = [];
    if (canProfile) tabs.push({ id: 'profile', label: t('group.tab_profile_label'), description: t('group.tab_profile_desc') });
    if (canMembers) tabs.push({ id: 'members', label: t('group.role_member'), description: t('group.tab_members_desc') });
    if (canInvite) tabs.push({ id: 'invites', label: t('group.perm.invite_label'), description: t('group.tab_invites_desc') });
    if (canAdmin) tabs.push({ id: 'roles', label: t('group.tab_roles_label'), description: t('group.tab_roles_desc') });
    if (canTransfer) tabs.push({ id: 'danger', label: t('group.tab_danger_label'), description: t('group.tab_danger_desc') });
    return tabs;
}

async function renderGroupManage(content, group, initialTab = 'profile') {
    if (!isGroupAdmin(group) && !hasGroupPermission(group, 'profile') && !hasGroupPermission(group, 'invite') && !hasGroupPermission(group, 'ban')) {
        content.innerHTML = `<p class="nui-empty-text">${t('group.no_manage_permission')}</p>`;
        return;
    }
    const canProfile = hasGroupPermission(group, 'profile');
    const canInvite = hasGroupPermission(group, 'invite');
    const canBan = hasGroupPermission(group, 'ban');
    const canAdmin = isGroupAdmin(group);
    const canMembers = canAdmin || canBan;
    const canTransfer = isGroupOwner(group);
    const [memberData, requestData] = await Promise.all([
        canMembers ? request(groupPath(group.id, `/members?status=active&limit=${MEMBER_PAGE_SIZE}&offset=0`)) : Promise.resolve({ members: [] }),
        canInvite ? request(groupPath(group.id, '/join-requests?status=pending')) : Promise.resolve({ join_requests: [] }),
    ]);
    const members = Array.isArray(memberData.members) ? memberData.members : [];
    const roles = Array.isArray(group.roles) ? group.roles : [];
    const joinRequests = Array.isArray(requestData.join_requests) ? requestData.join_requests : [];
    const groupId = escapeHTML(String(group.id));
    const tabs = renderManageTabs(group, { canProfile, canMembers, canInvite, canAdmin, canTransfer });
    const selectedTab = tabs.some((tab) => tab.id === initialTab) ? initialTab : (tabs[0]?.id || 'profile');
    content.innerHTML = `<main class="nui-page group-ui-page group-ui-manage-page" data-nui="page">
        <header class="nui-page-heading settings-detail-heading group-ui-page-heading" data-nui="page-heading">
            <div class="group-ui-manage-context">
                ${groupAvatar(group, 'nui-avatar group-ui-manage-avatar')}
                <div class="group-ui-manage-heading-copy">
                    <h3>${t('group.manage_heading', { name: escapeHTML(group.name || ''), tab: t('group.manage_fallback') })}</h3>
                    <p class="nui-help-text settings-group-description">${escapeHTML(tabs.find((tab) => tab.id === selectedTab)?.description || '')}</p>
                </div>
            </div>
            <a href="#group/${groupId}" class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary">${t('group.back_to_group')}</a>
        </header>
        <div class="nui-split settings-layout group-ui-manage-layout">
            <div class="nui-nav settings-group-list group-ui-manage-nav" role="tablist" aria-label="${t('group.manage_eyebrow')}" data-nui="nav">
                ${tabs.map((tab) => `<button type="button" class="nui-nav-item settings-group-button ${tab.id === selectedTab ? 'active' : ''}" id="group-manage-tab-${tab.id}" role="tab" aria-selected="${tab.id === selectedTab ? 'true' : 'false'}" aria-controls="group-manage-panel-${tab.id}" data-nui="nav-item" data-group-manage-tab="${tab.id}" data-group-manage-title="${escapeHTML(tab.label)}" data-group-manage-description="${escapeHTML(tab.description)}">${escapeHTML(tab.label)}</button>`).join('')}
            </div>
            <div class="group-ui-manage-detail">
                ${canProfile ? `<section class="nui-section settings-group-panel" id="group-manage-panel-profile" role="tabpanel" aria-labelledby="group-manage-tab-profile" data-group-manage-panel="profile" ${selectedTab === 'profile' ? '' : 'hidden'}>${groupPanelHeading(t('group.tab_profile_label'))}${renderGroupProfileForm(group)}</section>` : ''}
                ${canMembers ? `<section class="nui-section settings-group-panel" id="group-manage-panel-members" role="tabpanel" aria-labelledby="group-manage-tab-members" data-group-manage-panel="members" ${selectedTab === 'members' ? '' : 'hidden'}>${groupPanelHeading(t('group.members_manage_section'))}
                    <div class="nui-toolbar group-members-toolbar">
                        <input type="search" class="group-members-search-input nui-input" id="group-member-search" placeholder="${t('group.members_search_placeholder')}" aria-label="${t('group.members_search_label')}" aria-controls="group-members-list">
                        <span class="nui-help-text" id="group-member-count-label" role="status" aria-live="polite">${t('group.members_total', { count: members.length })}</span>
                    </div>
                    <div class="nui-list group-members-list" id="group-members-list">${members.map((entry) => renderGroupMemberRow(entry, group)).join('') || `<p class="nui-empty-text">${t('group.members_none')}</p>`}</div>
                    <p class="nui-empty-text group-members-empty" id="group-members-empty" hidden>${t('group.members_no_match')}</p>
                    <div id="group-members-sentinel"></div>
                </section>` : ''}
                ${canInvite ? `<section class="nui-section settings-group-panel" id="group-manage-panel-invites" role="tabpanel" aria-labelledby="group-manage-tab-invites" data-group-manage-panel="invites" ${selectedTab === 'invites' ? '' : 'hidden'}>
                    ${groupPanelHeading(t('group.invite_section'))}
                        <form id="group-invite-form" class="user-invite-form">
                            <label for="group-invite-search">${t('group.invite_id_label')}</label>
                            <input id="group-invite-search" type="search" class="nui-input" autocomplete="off" placeholder="${t('group.invite_id_placeholder')}" data-invite-input>
                            <div class="user-invite-suggestions" data-invite-suggestions role="listbox" aria-label="${t('group.invite_suggestions_label')}"></div>
                            <div class="user-invite-selected" data-invite-selected aria-live="polite"></div>
                            <div class="user-invite-actions"><p class="nui-help-text">${t('group.invite_hint')}</p><button type="submit" class="nui-button settings-primary-button" data-nui="button" data-invite-submit disabled>${t('group.invite_send_button')}</button></div>
                        </form>
                    ${groupPanelHeading(t('group.join_requests_section'))}
                    ${joinRequests.length ? `
                        <div class="nui-list group-requests-list">${joinRequests.map((item) => {
                            const reqUser = item.user || {};
                            const reqUserId = Number(item.userId ?? item.user_id);
                            const reqName = escapeHTML(reqUser.name || t('dm.user_number', { id: reqUserId }));
                            const reqAvatar = getUserIconUrl(reqUser);
                            return `<article class="nui-list-item nui-row group-request-card" data-nui="list-item">
                                <div class="group-member-info">
                                    <img ${rankAvatarAttributes(reqUser)} src="${escapeHTML(reqAvatar)}" class="nui-avatar group-member-avatar" alt="">
                                    <div class="group-member-details">
                                        <span class="group-member-name">${reqName}</span>
                                        <span class="group-member-handle">${escapeHTML(getNyaitterId(reqUser) || `#${reqUserId}`)}</span>
                                    </div>
                                </div>
                                <div class="nui-actions group-request-actions">
                                    <button type="button" class="nui-button settings-primary-button" data-nui="button" data-join-request="${escapeHTML(String(item.id))}" data-decision="approve">${t('group.approve')}</button>
                                    <button type="button" class="nui-button-secondary group-ui-secondary-button" data-nui="button-secondary" data-join-request="${escapeHTML(String(item.id))}" data-decision="decline">${t('group.decline')}</button>
                                </div>
                            </article>`;
                        }).join('')}</div>
                    ` : `<p class="nui-empty-text">${t('group.join_requests_none')}</p>`}
                </section>` : ''}
                ${canAdmin ? `<section class="nui-section settings-group-panel" id="group-manage-panel-roles" role="tabpanel" aria-labelledby="group-manage-tab-roles" data-group-manage-panel="roles" ${selectedTab === 'roles' ? '' : 'hidden'}>${groupPanelHeading(t('group.roles_section'))}${renderRolesPanel(group)}</section>` : ''}
                ${canTransfer ? `<section class="nui-section settings-group-panel group-manage-panel-plain" id="group-manage-panel-danger" role="tabpanel" aria-labelledby="group-manage-tab-danger" data-group-manage-panel="danger" ${selectedTab === 'danger' ? '' : 'hidden'}>
                    <div class="group-danger-stack">
                        <div class="nui-card nui-danger-card group-danger-card" data-nui="card">
                            <h4 class="nui-section-title group-danger-card-title">${t('group.danger_transfer_title')}</h4>
                            <p class="nui-help-text group-danger-card-desc">${t('group.danger_transfer_desc')}</p>
                            <form id="group-transfer-owner-form" class="nui-form group-danger-form">
                                <label>${t('group.danger_new_owner_label')}<input name="user_id" class="nui-input" inputmode="numeric" required placeholder="${t('group.danger_new_owner_placeholder')}"></label>
                                <button type="submit" class="nui-button-danger settings-danger-button" data-nui="button-danger">${t('group.danger_transfer_button')}</button>
                            </form>
                        </div>
                        <div class="nui-card nui-danger-card group-danger-card" data-nui="card">
                            <h4 class="nui-section-title group-danger-card-title">${t('group.danger_delete_title')}</h4>
                            <p class="nui-help-text group-danger-card-desc">${t('group.danger_delete_desc')}</p>
                            <div>
                                <button type="button" id="delete-group-button" class="nui-button-danger settings-danger-button" data-nui="button-danger">${t('group.danger_delete_title')}</button>
                            </div>
                        </div>
                    </div>
                </section>` : ''}
            </div>
        </div>
    </main>`;
    bindGroupManageEvents(group);
}

function refreshGroupManage(group, defaultTab = null) {
    const activeTab = defaultTab || document.querySelector('[data-group-manage-tab].active')?.dataset.groupManageTab || 'profile';
    return showGroupDetailScreen(group.id, 'manage', null, activeTab);
}

function bindGroupProfileForm(group) {
    const form = document.getElementById('group-profile-form');
    if (!form) return;

    const nameInput = document.getElementById('group-profile-name');
    const descriptionInput = document.getElementById('group-profile-description');
    const iconInput = document.getElementById('group-profile-icon-input');
    const headerInput = document.getElementById('group-profile-header-input');
    const iconPreview = document.getElementById('group-profile-icon-picker');
    const headerPreview = document.getElementById('group-profile-header-picker');
    const saveStatus = document.getElementById('group-profile-save-status');
    let statusTimer = null;
    const setSaveStatus = (text, reset = false) => {
        if (!saveStatus) return;
        clearTimeout(statusTimer);
        saveStatus.textContent = text;
        if (reset) {
            statusTimer = setTimeout(() => {
                saveStatus.textContent = t('group.autosave_note');
            }, 2500);
        }
    };
    let newIconDataUrl = null;
    let newHeaderDataUrl = null;
    let resetIcon = false;
    let resetHeader = false;
    let saveInFlight = false;
    let saveQueued = false;
    let savedName = String(group?.name || '');
    let savedDescription = String(group?.description || '');
    let savedVisibility = String(group?.visibility || 'open');

    const hasPendingChanges = () => (
        String(nameInput?.value || '') !== savedName
        || String(descriptionInput?.value || '') !== savedDescription
        || String(form.querySelector('input[name="visibility"]:checked')?.value || savedVisibility) !== savedVisibility
        || resetIcon
        || resetHeader
        || Boolean(newIconDataUrl)
        || Boolean(newHeaderDataUrl)
    );

    const updateSavedGroup = (updatedGroup = {}) => {
        Object.assign(group, updatedGroup);
        savedName = String(group?.name || '');
        savedDescription = String(group?.description || '');
        savedVisibility = String(group?.visibility || 'open');
        document.getElementById('page-title')?.replaceChildren(document.createTextNode(savedName || t('nav.groups')));
        const heading = document.querySelector('.group-ui-page-heading h3');
        if (heading) heading.textContent = t('group.manage_heading', { name: savedName, tab: document.querySelector('[data-group-manage-tab].active')?.dataset.groupManageTitle || t('group.manage_fallback') });
    };

    const saveProfile = async () => {
        if (saveInFlight) {
            saveQueued = true;
            return;
        }
        if (!hasPendingChanges() || !form.reportValidity()) return;
        saveInFlight = true;
        setSaveStatus(t('group.saving_ellipsis'));
        const values = new FormData(form);
        const body = {
            name: values.get('name'),
            description: values.get('description'),
            visibility: values.get('visibility'),
        };
        const uploadedFileIds = [];
        const previousFileIds = new Set();
        const shouldReplaceIcon = resetIcon || Boolean(newIconDataUrl);
        const shouldReplaceHeader = resetHeader || Boolean(newHeaderDataUrl);
        try {
            if (resetIcon) {
                body.icon_data = null;
            } else if (newIconDataUrl) {
                const existingIconId = isStoredImageId(group?.icon_data) ? group.icon_data : null;
                const fileId = await uploadFileViaEdgeFunction(imageDataUrlToFile(newIconDataUrl), {
                    replaceId: existingIconId,
                });
                if (!existingIconId) uploadedFileIds.push(fileId);
                body.icon_data = fileId;
            }
            if (resetHeader) {
                body.header_image = null;
            } else if (newHeaderDataUrl) {
                const existingHeaderId = isStoredImageId(group?.header_image) ? group.header_image : null;
                const fileId = await uploadFileViaEdgeFunction(imageDataUrlToFile(newHeaderDataUrl), {
                    replaceId: existingHeaderId,
                });
                if (!existingHeaderId) uploadedFileIds.push(fileId);
                body.header_image = fileId;
            }
            if (resetIcon && isStoredImageId(group?.icon_data)) previousFileIds.add(group.icon_data);
            if (resetHeader && isStoredImageId(group?.header_image)) previousFileIds.add(group.header_image);

            const data = await request(groupPath(group.id), { method: 'PATCH', body });
            if (shouldReplaceIcon) {
                group.icon_data = body.icon_data;
                newIconDataUrl = null;
                resetIcon = false;
            }
            if (shouldReplaceHeader) {
                group.header_image = body.header_image;
                newHeaderDataUrl = null;
                resetHeader = false;
            }
            updateSavedGroup(data.group || {});
            setSaveStatus(t('group.saved_status'), true);
            if (previousFileIds.size > 0) {
                void deleteFilesViaEdgeFunction([...previousFileIds]).catch((error) => {
                    console.warn('グループの古い画像を削除できませんでした。', error);
                });
            }
        } catch (error) {
            if (uploadedFileIds.length > 0) {
                await deleteFilesViaEdgeFunction(uploadedFileIds).catch(() => {});
            }
            setSaveStatus(t('group.save_failed_status'));
            showAppAlert(error.message || t('group.update_failed'));
        } finally {
            saveInFlight = false;
            if (saveQueued) {
                saveQueued = false;
                void saveProfile();
            }
        }
    };

    iconPreview?.addEventListener('click', () => iconInput?.click());
    headerPreview?.addEventListener('click', () => headerInput?.click());
    iconInput?.addEventListener('change', async (event) => {
        try {
            const file = event.target.files?.[0];
            if (!file) return;
            newIconDataUrl = await resizeImageToDataUrl(file, 300, 300);
            resetIcon = false;
            setModalIconPreview(iconPreview, newIconDataUrl);
            void saveProfile();
        } catch (error) {
            showAppAlert(error.message || t('group.icon_select_failed'));
        }
    });
    headerInput?.addEventListener('change', async (event) => {
        try {
            const file = event.target.files?.[0];
            if (!file) return;
            newHeaderDataUrl = await resizeImageToDataUrl(file, 1500, 600);
            resetHeader = false;
            setModalHeaderPreview(headerPreview, newHeaderDataUrl);
            void saveProfile();
        } catch (error) {
            showAppAlert(error.message || t('group.header_select_failed'));
        }
    });
    document.getElementById('reset-group-profile-icon')?.addEventListener('click', () => {
        resetIcon = true;
        newIconDataUrl = null;
        if (iconInput) iconInput.value = '';
        setModalIconPreview(iconPreview);
        void saveProfile();
    });
    document.getElementById('reset-group-profile-header')?.addEventListener('click', () => {
        resetHeader = true;
        newHeaderDataUrl = null;
        if (headerInput) headerInput.value = '';
        setModalHeaderPreview(headerPreview);
        void saveProfile();
    });
    nameInput?.addEventListener('blur', () => { void saveProfile(); });
    descriptionInput?.addEventListener('blur', () => { void saveProfile(); });
    form.querySelectorAll('input[name="visibility"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            form.querySelectorAll('.group-visibility-card').forEach((card) => {
                card.classList.toggle('is-selected', card.dataset.visibilityCard === radio.value);
            });
            void saveProfile();
        });
    });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        void saveProfile();
    });
}

function bindGroupManageEvents(group) {
    const headingTitle = document.querySelector('.group-ui-page-heading h3');
    const headingDescription = document.querySelector('.group-ui-page-heading .settings-group-description');
    const tabsContainer = document.querySelector('.settings-group-list');
    const manageDetail = document.querySelector('.group-ui-manage-detail');

    if (tabsContainer) {
        groupManageTabGroupController?.destroy();
        groupManageTabGroupController = initTabGroup({
            container: tabsContainer,
            tabSelector: '[data-group-manage-tab]',
            contentContainer: manageDetail,
            getTabKey: (button) => button.dataset.groupManageTab,
            onTabChange: (tabId, button) => {
                document.querySelectorAll('[data-group-manage-panel]').forEach((panel) => {
                    panel.hidden = panel.dataset.groupManagePanel !== tabId;
                });
                if (headingTitle) headingTitle.textContent = t('group.manage_heading', { name: group.name || '', tab: button.dataset.groupManageTitle || t('group.manage_fallback') });
                if (headingDescription) headingDescription.textContent = button.dataset.groupManageDescription || '';
            },
        });
    }
    bindGroupProfileForm(group);

    // メンバーのインクリメンタル検索
    const memberSearchInput = document.getElementById('group-member-search');
    const memberCountLabel = document.getElementById('group-member-count-label');
    const memberEmpty = document.getElementById('group-members-empty');
    const applyMemberFilter = () => {
        const memberItems = document.querySelectorAll('.group-member-item');
        const query = (memberSearchInput?.value || '').trim().toLowerCase();
        let visibleCount = 0;
        memberItems.forEach((item) => {
            const searchText = (item.dataset.memberSearchText || '').toLowerCase();
            const matches = !query || searchText.includes(query);
            item.style.display = matches ? 'flex' : 'none';
            if (matches) visibleCount += 1;
        });
        if (memberCountLabel) {
            memberCountLabel.textContent = query
                ? t('group.members_fraction', { visible: visibleCount, total: memberItems.length })
                : t('group.members_total', { count: memberItems.length });
        }
        if (memberEmpty) {
            memberEmpty.hidden = !(query && visibleCount === 0 && memberItems.length > 0);
        }
    };
    if (memberSearchInput) {
        memberSearchInput.addEventListener('input', applyMemberFilter);
    }
    const groupInviteForm = document.getElementById('group-invite-form');
    if (groupInviteForm) {
        const inviteSubmit = groupInviteForm.querySelector('[data-invite-submit]');
        const invitePicker = createUserInvitePicker({
            input: groupInviteForm.querySelector('[data-invite-input]'),
            suggestions: groupInviteForm.querySelector('[data-invite-suggestions]'),
            selected: groupInviteForm.querySelector('[data-invite-selected]'),
            onChange: (size) => { inviteSubmit.disabled = size === 0; },
        });
        groupInviteForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!invitePicker.size) return;
            inviteSubmit.disabled = true;
            try {
                showLoading(true);
                const results = await Promise.allSettled(invitePicker.ids.map((userId) => request(groupPath(group.id, '/invites'), { method: 'POST', body: { user_id: userId } })));
                const failed = results.filter((result) => result.status === 'rejected');
                if (failed.length > 0) {
                    showAppAlert(failed.map((result) => result.reason?.message || t('group.invite_send_failed')).join('\n'));
                } else {
                    await showAppAlert(t('group.invite_sent'));
                }
                if (failed.length < invitePicker.size) invitePicker.clear();
            } catch (error) {
                showAppAlert(error.message || t('group.invite_send_failed'));
            } finally {
                showLoading(false);
                inviteSubmit.disabled = invitePicker.size === 0;
            }
        });
    }
    document.querySelectorAll('[data-join-request]').forEach((button) => button.addEventListener('click', async () => {
        try {
            showLoading(true);
            await request(groupPath(group.id, `/join-requests/${encodeURIComponent(button.dataset.joinRequest)}/respond`), { method: 'POST', body: { decision: button.dataset.decision } });
            await refreshGroupManage(group);
        } catch (error) {
            showAppAlert(error.message || t('group.join_request_process_failed'));
        } finally {
            showLoading(false);
        }
    }));
    const membersListEl = document.getElementById('group-members-list');
    membersListEl?.addEventListener('change', async (event) => {
        const select = event.target.closest('[data-member-role]');
        if (!select) return;
        try {
            showLoading(true);
            await request(groupPath(group.id, `/members/${encodeURIComponent(select.dataset.memberRole)}`), { method: 'PATCH', body: { role_id: select.value } });
            await refreshGroupManage(group, 'members');
        } catch (error) {
            showAppAlert(error.message || t('group.role_update_failed'));
        } finally {
            showLoading(false);
        }
    });
    membersListEl?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-ban-member]');
        if (!button) return;
        if (!await showAppConfirm(t('group.ban_confirm'))) return;
        try {
            showLoading(true);
            await request(groupPath(group.id, `/members/${encodeURIComponent(button.dataset.banMember)}/ban`), { method: 'POST', body: {} });
            await refreshGroupManage(group, 'members');
        } catch (error) {
            showAppAlert(error.message || t('group.ban_failed'));
        } finally {
            showLoading(false);
        }
    });

    // メンバー一覧の続きをスクロールで読み込む
    const membersSentinel = document.getElementById('group-members-sentinel');
    if (membersListEl && membersSentinel) {
        stopGroupMembersScroll();
        let offset = membersListEl.querySelectorAll('.group-member-item').length;
        let loading = false;
        let done = offset < MEMBER_PAGE_SIZE;
        const loadMoreMembers = async () => {
            if (loading || done || !membersListEl.isConnected) return;
            loading = true;
            try {
                const data = await request(groupPath(group.id, `/members?status=active&limit=${MEMBER_PAGE_SIZE}&offset=${offset}`));
                const more = Array.isArray(data.members) ? data.members : [];
                offset += more.length;
                if (more.length) {
                    membersListEl.insertAdjacentHTML('beforeend', more.map((entry) => renderGroupMemberRow(entry, group)).join(''));
                    applyMemberFilter();
                }
                done = more.length < MEMBER_PAGE_SIZE;
                if (done) {
                    stopGroupMembersScroll();
                    membersSentinel.remove();
                }
            } catch {
                // 失敗したページは、次に末尾が見えたときに取り直す
            } finally {
                loading = false;
            }
        };
        if (!done) {
            groupMembersObserver = new IntersectionObserver((entries) => {
                if (entries.some((entry) => entry.isIntersecting)) void loadMoreMembers();
            }, { rootMargin: '400px 0px' });
            groupMembersObserver.observe(membersSentinel);
            groupMembersScrollHandler = () => {
                if (!membersSentinel.getClientRects().length) return;
                if (membersSentinel.getBoundingClientRect().top < window.innerHeight + 400) void loadMoreMembers();
            };
            window.addEventListener('scroll', groupMembersScrollHandler, { passive: true, capture: true });
            groupMembersScrollHandler();
        }
    }

    // ロール編集ペインの開閉
    document.querySelectorAll('[data-toggle-role]').forEach((button) => {
        button.addEventListener('click', () => {
            const roleId = button.dataset.toggleRole;
            const editor = document.getElementById(`role-editor-${roleId}`);
            if (!editor) return;
            const isHidden = editor.classList.contains('hidden');
            editor.classList.toggle('hidden', !isHidden);
            button.textContent = isHidden ? t('common.close') : t('post.edit');
            button.setAttribute('aria-expanded', String(isHidden));
        });
    });

    document.querySelectorAll('[data-cancel-role]').forEach((button) => {
        button.addEventListener('click', () => {
            const roleId = button.dataset.cancelRole;
            const editor = document.getElementById(`role-editor-${roleId}`);
            const toggleBtn = document.querySelector(`[data-toggle-role="${roleId}"]`);
            if (editor) editor.classList.add('hidden');
            if (toggleBtn) {
                toggleBtn.textContent = t('post.edit');
                toggleBtn.setAttribute('aria-expanded', 'false');
            }
        });
    });

    // 新規ロール作成フォームの開閉
    const createWrapper = document.getElementById('group-role-create-wrapper');
    const toggleCreateBtn = document.getElementById('toggle-create-role-btn');
    const closeCreateRole = () => {
        createWrapper?.classList.add('hidden');
        toggleCreateBtn?.classList.remove('hidden');
    };
    toggleCreateBtn?.addEventListener('click', () => {
        createWrapper?.classList.remove('hidden');
        toggleCreateBtn?.classList.add('hidden');
        document.getElementById('create-role-name')?.focus();
    });
    document.getElementById('cancel-create-role-btn')?.addEventListener('click', closeCreateRole);
    document.getElementById('cancel-create-role-btn-action')?.addEventListener('click', closeCreateRole);

    // ロール編集のインプレース保存
    document.querySelectorAll('[data-edit-group-role]').forEach((form) => {
        const roleId = form.dataset.editGroupRole;
        const statusEl = document.getElementById(`save-status-${roleId}`);
        const submitBtn = form.querySelector('.group-role-save-btn');
        let saveTimeout = null;

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            const values = new FormData(form);
            const newName = String(values.get('name') || '').trim();
            const newPermissions = values.getAll('permissions');

            if (submitBtn) {
                submitBtn.disabled = true;
        submitBtn.textContent = t('common.saving');
            }
            if (statusEl) {
                statusEl.textContent = '';
            }

            try {
                await request(groupPath(group.id, `/roles/${encodeURIComponent(roleId)}`), {
                    method: 'PATCH',
                    body: { name: newName, permissions: newPermissions },
                });

                // グループデータのインメモリ更新
                const existingRole = group.roles?.find((r) => String(r.id) === String(roleId));
                if (existingRole) {
                    existingRole.name = newName;
                    existingRole.permissions = newPermissions;
                }

                // サマリータイトルと権限プレビューのリアルタイム更新
                const titleEl = document.querySelector(`[data-role-title="${roleId}"]`);
                if (titleEl) titleEl.textContent = newName;
                const previewEl = document.querySelector(`[data-role-preview="${roleId}"]`);
                if (previewEl) previewEl.innerHTML = renderRoleChips(existingRole || { permissions: newPermissions }, false);

                // メンバー一覧のロール選択肢更新
                document.querySelectorAll(`select.group-ui-role-select option[value="${roleId}"]`).forEach((opt) => {
                    opt.textContent = newName;
                });

                if (statusEl) {
                    statusEl.textContent = t('group.role_saved_check');
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(() => {
                        if (statusEl) statusEl.textContent = '';
                    }, 3000);
                }
            } catch (error) {
                showAppAlert(error.message || t('group.role_update_failed'));
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = t('group.role_save');
                }
            }
        });
    });

    // 新規ロール作成
    document.getElementById('group-role-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
            showLoading(true);
            await request(groupPath(group.id, '/roles'), { method: 'POST', body: { name: form.get('name'), permissions: form.getAll('permissions') } });
            await refreshGroupManage(group, 'roles');
        } catch (error) {
            showAppAlert(error.message || t('group.role_add_failed'));
        } finally {
            showLoading(false);
        }
    });

    // ロール削除
    document.querySelectorAll('[data-delete-role]').forEach((button) => button.addEventListener('click', async () => {
        if (!await showAppConfirm(t('group.role_delete_confirm'))) return;
        try {
            showLoading(true);
            await request(groupPath(group.id, `/roles/${encodeURIComponent(button.dataset.deleteRole)}`), { method: 'DELETE' });
            await refreshGroupManage(group, 'roles');
        } catch (error) {
            showAppAlert(error.message || t('group.role_delete_failed'));
        } finally {
            showLoading(false);
        }
    }));
    document.getElementById('group-transfer-owner-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const userId = Number(new FormData(event.currentTarget).get('user_id'));
        if (!await showAppConfirm(t('group.transfer_confirm'))) return;
        try {
            showLoading(true);
            await request(groupPath(group.id, '/transfer-owner'), { method: 'POST', body: { user_id: userId } });
            window.location.hash = `#group/${group.id}`;
        } catch (error) {
            showAppAlert(error.message || t('group.transfer_failed'));
        } finally {
            showLoading(false);
        }
    });
    document.getElementById('delete-group-button')?.addEventListener('click', async () => {
        if (!await showAppConfirm(t('group.delete_confirm', { name: group.name || t('group.this_group') }))) return;
        if (!await showAppConfirm(t('group.delete_confirm_final'))) return;
        try {
            showLoading(true);
            await request(groupPath(group.id), { method: 'DELETE' });
            window.location.hash = '#groups';
        } catch (error) {
            showAppAlert(error.message || t('group.delete_failed'));
        } finally {
            showLoading(false);
        }
    });
}

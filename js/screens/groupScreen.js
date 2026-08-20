import { apiRequest } from '../api.js';
import { ICONS } from '../icons.js';
import { getCurrentUser } from '../state.js';
import { loadPostsWithPagination } from '../modules/pagination.js';
import { uploadFileViaEdgeFunction, deleteFilesViaEdgeFunction } from '../modules/posts.js';
import { escapeHTML, getNyaitterId, showAppAlert, showAppConfirm, showLoading } from '../utils/helpers.js';

const VISIBILITY_LABELS = {
    open: 'Open',
    private: 'Private',
    invite: 'Invite',
    open_invite: 'OpenInvite',
};

const PERMISSION_LABELS = {
    invite: '招待・参加申請',
    announce: 'アナウンス',
    delete: 'ポスト削除',
    ban: '禁止',
    post: 'ポスト',
    profile: 'プロフィール編集',
    admin: '管理者',
};

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

function visibilityOptions(selected = 'open') {
    return Object.entries(VISIBILITY_LABELS)
        .map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`)
        .join('');
}

function getGroupImageUrl(value) {
    const image = typeof value === 'string' ? value.trim() : '';
    if (!image) return '';
    if (/^data:image\//i.test(image) || /^https?:\/\//i.test(image)) return image;
    const configuredUrl = globalThis.NyaitterClientConfig?.userFileUrl?.(image);
    return typeof configuredUrl === 'string' ? configuredUrl : image;
}

function groupAvatar(group, className = 'group-ui-avatar') {
    const imageUrl = getGroupImageUrl(group?.icon_data);
    if (imageUrl) {
        return `<img class="${className}" src="${escapeHTML(imageUrl)}" alt="">`;
    }
    return `<div class="${className} group-ui-avatar-fallback" aria-hidden="true">${ICONS.group}</div>`;
}

function groupHeader(group) {
    const imageUrl = getGroupImageUrl(group?.header_image);
    if (!imageUrl) return '';
    return `<div class="group-ui-profile-header"><img src="${escapeHTML(imageUrl)}" alt=""></div>`;
}

function groupMeta(group) {
    const visibility = VISIBILITY_LABELS[group?.visibility] || group?.visibility || 'Open';
    return `${escapeHTML(visibility)} ・ ${Number(group?.member_count || 0)}人`;
}

function renderGroupCard(group, { joined = false } = {}) {
    const groupId = escapeHTML(String(group.id));
    const name = escapeHTML(group.name || '無題のグループ');
    const description = escapeHTML(group.description || '説明はありません。');
    return `<article class="settings-session-item group-ui-list-item">
        <a class="group-ui-list-link" href="#group/${groupId}">
            ${groupAvatar(group)}
            <div class="settings-session-details">
                <span class="settings-session-title">${name}${joined ? '<span class="settings-session-current">参加中</span>' : ''}</span>
                <p>${groupMeta(group)}<br>${description}</p>
            </div>
        </a>
    </article>`;
}

function showScreen(showScreenFn) {
    if (typeof showScreenFn === 'function') showScreenFn('groups-screen');
    else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('groups-screen')?.classList.remove('hidden');
    }
}

function renderGroupSection(title, content, description = '') {
    return `<section class="group-ui-section">
        <div class="group-ui-section-heading">
            <div><h4>${escapeHTML(title)}</h4>${description ? `<p class="settings-help-text">${escapeHTML(description)}</p>` : ''}</div>
        </div>
        ${content}
    </section>`;
}

function imageDataUrlToFile(dataUrl) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(String(dataUrl || ''));
    if (!match) throw new Error('画像の形式が正しくありません。');
    const mimeType = match[1].toLowerCase();
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType] || 'png';
    return new File([bytes], `group-image.${extension}`, { type: mimeType });
}

async function resizeImageToDataUrl(file, maxWidth, maxHeight) {
    if (!file?.type?.startsWith('image/')) throw new Error('画像ファイルを選択してください。');
    const sourceDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('画像を読み込めませんでした。'));
        reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('画像を読み込めませんでした。'));
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
        ? `<img src="${escapeHTML(source)}" alt="アイコンのプレビュー">`
        : `<span aria-hidden="true">${ICONS.group}</span>`;
}

function setModalHeaderPreview(container, source = '') {
    container.innerHTML = source
        ? `<img src="${escapeHTML(source)}" alt="ヘッダー画像のプレビュー">`
        : '<span>ヘッダー画像を選択</span>';
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
    modal.className = 'modal-overlay group-modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'group-modal-title');
    modal.innerHTML = `<div class="modal-content group-modal-content">
        <button type="button" class="modal-close-btn" aria-label="閉じる">×</button>
        <form id="group-modal-form" class="group-ui-form group-modal-form">
            <header class="group-modal-heading"><h3 id="group-modal-title">${editing ? 'グループを編集' : 'グループを作成'}</h3><p class="settings-help-text">${editing ? 'グループのプロフィールと公開レベルを変更できます。' : '作成後もプロフィールや公開レベルを変更できます。'}</p></header>
            <div class="group-modal-images">
                <div class="group-modal-image-field">
                    <span class="group-modal-image-label">アイコン</span>
                    <div class="group-modal-image-actions">
                        <button type="button" class="group-modal-icon-preview" id="group-icon-picker" title="アイコン画像を選択"></button>
                        <input type="file" id="group-icon-input" accept="image/*" class="hidden">
                        ${editing ? '<button type="button" class="login-secondary-button" id="reset-group-icon">アイコンを削除</button>' : ''}
                    </div>
                </div>
                <div class="group-modal-image-field group-modal-header-field">
                    <span class="group-modal-image-label">ヘッダー画像</span>
                    <div class="group-modal-image-actions">
                        <button type="button" class="group-modal-header-preview" id="group-header-picker" title="ヘッダー画像を選択"></button>
                        <input type="file" id="group-header-input" accept="image/*" class="hidden">
                        ${editing ? '<button type="button" class="login-secondary-button" id="reset-group-header">ヘッダー画像を削除</button>' : ''}
                    </div>
                </div>
            </div>
            <label>グループ名<input name="name" maxlength="100" required value="${escapeHTML(group?.name || '')}" placeholder="グループ名"></label>
            <label>説明<textarea name="description" maxlength="2000" rows="4" placeholder="グループの説明">${escapeHTML(group?.description || '')}</textarea></label>
            <label>公開レベル<select name="visibility" class="settings-select">${visibilityOptions(group?.visibility || 'open')}</select></label>
            <div class="settings-save-row"><button type="button" class="login-secondary-button" data-close-group-modal>キャンセル</button><button type="submit" class="settings-primary-button">${editing ? '変更を保存' : '作成'}</button></div>
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
            showAppAlert(error.message || 'アイコン画像を選択できませんでした。');
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
            showAppAlert(error.message || 'ヘッダー画像を選択できませんでした。');
        }
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
        const shouldReplaceIcon = resetIcon || Boolean(newIconDataUrl);
        const shouldReplaceHeader = resetHeader || Boolean(newHeaderDataUrl);
        try {
            showLoading(true);
            if (resetIcon) {
                body.icon_data = null;
            } else if (newIconDataUrl) {
                const fileId = await uploadFileViaEdgeFunction(imageDataUrlToFile(newIconDataUrl));
                uploadedFileIds.push(fileId);
                body.icon_data = fileId;
            }
            if (resetHeader) {
                body.header_image = null;
            } else if (newHeaderDataUrl) {
                const fileId = await uploadFileViaEdgeFunction(imageDataUrlToFile(newHeaderDataUrl));
                uploadedFileIds.push(fileId);
                body.header_image = fileId;
            }
            if (shouldReplaceIcon && isStoredImageId(group?.icon_data)) previousFileIds.add(group.icon_data);
            if (shouldReplaceHeader && isStoredImageId(group?.header_image)) previousFileIds.add(group.header_image);

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
            if (!savedGroup?.id) throw new Error('更新後のグループを取得できませんでした。');
            if (editing) {
                await showGroupDetailScreen(savedGroup.id, 'manage');
            } else {
                window.location.hash = `#group/${savedGroup.id}`;
            }
        } catch (error) {
            if (uploadedFileIds.length > 0) {
                await deleteFilesViaEdgeFunction(uploadedFileIds).catch(() => {});
            }
            showAppAlert(error.message || (editing ? 'グループを更新できませんでした。' : 'グループを作成できませんでした。'));
        } finally {
            showLoading(false);
        }
    });

    requestAnimationFrame(() => form?.querySelector('[name="name"]')?.focus());
}

export async function showGroupsScreen(showScreenFn = null) {
    if (!getCurrentUser()) {
        window.location.hash = '#';
        return;
    }
    document.getElementById('page-header').innerHTML = '<h2 id="page-title">グループ</h2>';
    showScreen(showScreenFn);
    const content = groupsContent();
    if (!content) return;
    content.innerHTML = '<div class="group-screen-loading"><div class="spinner"></div></div>';
    try {
        const [mineData, publicData, inviteData] = await Promise.all([
            request('/server/api/groups/mine?limit=200'),
            request('/server/api/groups?limit=100'),
            request('/server/api/groups/invites/mine'),
        ]);
        const joinedGroups = Array.isArray(mineData.groups) ? mineData.groups : [];
        const publicGroups = Array.isArray(publicData.groups) ? publicData.groups : [];
        const invites = Array.isArray(inviteData.invites) ? inviteData.invites : [];
        const joinedIds = new Set(joinedGroups.map((group) => String(group.id)));
        content.innerHTML = `<main class="group-ui-page">
            <header class="settings-detail-heading group-ui-page-heading">
                <div><h3>グループ</h3><p class="settings-group-description">投稿は参加者だけが閲覧できます。</p></div>
                <button type="button" class="settings-primary-button" id="open-create-group">グループを作成</button>
            </header>
            ${invites.length ? renderGroupSection('グループ招待', `<div class="settings-sessions-list">${invites.map((invite) => `<article class="settings-session-item group-ui-invite-item"><div class="settings-session-details"><span class="settings-session-title">${escapeHTML(invite.group?.name || 'グループ')}</span><p>グループへの招待が届いています。</p></div><div class="settings-session-actions"><button type="button" class="settings-primary-button" data-group-invite="${escapeHTML(String(invite.id))}" data-decision="accept">参加</button><button type="button" class="login-secondary-button" data-group-invite="${escapeHTML(String(invite.id))}" data-decision="decline">拒否</button></div></article>`).join('')}</div>`) : ''}
            ${renderGroupSection('参加中のグループ', joinedGroups.length ? `<div class="settings-sessions-list">${joinedGroups.map((group) => renderGroupCard(group, { joined: true })).join('')}</div>` : '<p class="settings-help-text">参加中のグループはありません。</p>')}
            ${renderGroupSection('見つける', publicGroups.length ? `<div class="settings-sessions-list">${publicGroups.map((group) => renderGroupCard(group, { joined: joinedIds.has(String(group.id)) })).join('')}</div>` : '<p class="settings-help-text">公開グループはまだありません。</p>')}
        </main>`;
        bindGroupsIndexEvents();
    } catch (error) {
        content.innerHTML = `<p class="error-message">グループの読み込みに失敗しました。${escapeHTML(error.message || '')}</p>`;
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
            showAppAlert(error.message || '招待を処理できませんでした。');
        } finally {
            showLoading(false);
        }
    }));
}

export async function showGroupDetailScreen(groupId, section = 'overview', showScreenFn = null) {
    if (!getCurrentUser()) {
        window.location.hash = '#';
        return;
    }
    showScreen(showScreenFn);
    const content = groupsContent();
    if (!content) return;
    content.innerHTML = '<div class="group-screen-loading"><div class="spinner"></div></div>';
    try {
        const data = await request(groupPath(groupId));
        const group = data.group;
        if (!group) throw new Error('グループが見つかりません。');
        document.getElementById('page-header').innerHTML = `<div class="header-with-back-button"><button class="header-back-btn" type="button" id="group-back-btn">${ICONS.back}</button><h2 id="page-title">${escapeHTML(group.name || 'グループ')}</h2></div>`;
        document.getElementById('group-back-btn')?.addEventListener('click', () => { window.location.hash = '#groups'; });
        if (section === 'manage') await renderGroupManage(content, group);
        else renderGroupOverview(content, group);
    } catch (error) {
        content.innerHTML = `<p class="error-message">グループを読み込めませんでした。${escapeHTML(error.message || '')}</p>`;
    } finally {
        showLoading(false);
    }
}

function renderGroupOverview(content, group) {
    const membership = group.membership;
    const isActive = membership?.status === 'active';
    const canManage = isGroupAdmin(group) || hasGroupPermission(group, 'profile') || hasGroupPermission(group, 'invite') || hasGroupPermission(group, 'ban');
    const groupId = escapeHTML(String(group.id));
    content.innerHTML = `<main class="group-ui-page">
        <section class="group-ui-profile">
            ${groupHeader(group)}
            <div class="group-ui-profile-main">
                ${groupAvatar(group, 'group-ui-profile-avatar')}
                <div class="group-ui-profile-copy"><h3>${escapeHTML(group.name || '')}</h3><p class="settings-group-description">${groupMeta(group)}</p><p>${escapeHTML(group.description || '説明はありません。')}</p></div>
                <div class="group-ui-profile-actions">
                    ${!membership ? '<button type="button" class="settings-primary-button" id="join-group-btn">参加する</button>' : ''}
                    ${membership?.status === 'pending' ? '<span class="settings-session-current">参加申請を確認中</span>' : ''}
                    ${membership?.status === 'invited' ? '<span class="settings-session-current">招待に応答してください</span>' : ''}
                    ${isActive && !isGroupOwner(group) ? '<button type="button" class="login-secondary-button" id="leave-group-btn">退出する</button>' : ''}
                    ${canManage ? `<a class="login-secondary-button" href="#group/${groupId}/manage">管理</a>` : ''}
                </div>
            </div>
        </section>
        ${isActive ? `<section class="group-ui-posts"><div class="timeline-tabs-sticky-container group-ui-post-tabs"><div class="timeline-tabs" role="tablist" aria-label="投稿の表示"><button type="button" class="timeline-tab-button active" data-group-post-mode="all" role="tab" aria-selected="true">すべて</button><button type="button" class="timeline-tab-button" data-group-post-mode="recommended" role="tab" aria-selected="false">おすすめ</button><button type="button" class="timeline-tab-button" data-group-post-mode="announcements" role="tab" aria-selected="false">アナウンス</button></div></div><div id="group-detail-posts"></div></section>` : '<p class="settings-help-text">投稿は参加者だけが閲覧できます。</p>'}
    </main>`;
    if (isActive) {
        const postContainer = document.getElementById('group-detail-posts');
        const loadGroupPosts = (mode = 'all') => {
            if (!postContainer) return;
            postContainer.innerHTML = '';
            document.querySelectorAll('[data-group-post-mode]').forEach((button) => {
                const active = button.dataset.groupPostMode === mode;
                button.classList.toggle('active', active);
                button.setAttribute('aria-selected', String(active));
            });
            void loadPostsWithPagination(postContainer, 'group_posts', { groupId: group.id, mode });
        };
        document.querySelectorAll('[data-group-post-mode]').forEach((button) => button.addEventListener('click', () => loadGroupPosts(button.dataset.groupPostMode || 'all')));
        loadGroupPosts('all');
    }
    document.getElementById('join-group-btn')?.addEventListener('click', () => joinGroup(group));
    document.getElementById('leave-group-btn')?.addEventListener('click', () => leaveGroup(group));
}

async function joinGroup(group) {
    try {
        showLoading(true);
        const data = await request(groupPath(group.id, '/join'), { method: 'POST', body: {} });
        if (data.pending) await showAppAlert('参加申請を送信しました。');
        window.location.hash = `#group/${group.id}`;
    } catch (error) {
        showAppAlert(error.message || '参加できませんでした。');
    } finally {
        showLoading(false);
    }
}

async function leaveGroup(group) {
    if (!await showAppConfirm('このグループから退出しますか？')) return;
    try {
        showLoading(true);
        await request(groupPath(group.id, '/leave'), { method: 'POST', body: {} });
        window.location.hash = '#groups';
    } catch (error) {
        showAppAlert(error.message || '退出できませんでした。');
    } finally {
        showLoading(false);
    }
}

function renderManageTabs(group, { canProfile, canMembers, canInvite, canAdmin, canTransfer }) {
    const tabs = [];
    if (canProfile) tabs.push({ id: 'profile', label: 'プロフィール', description: 'グループの名前、説明、公開レベル、画像を管理します。' });
    if (canMembers) tabs.push({ id: 'members', label: 'メンバー', description: 'メンバーのロール変更と参加禁止を管理します。' });
    if (canInvite) tabs.push({ id: 'invites', label: '招待・申請', description: 'ユーザーの招待と参加申請を管理します。' });
    if (canAdmin) tabs.push({ id: 'roles', label: 'ロール', description: 'ロールと権限を管理します。' });
    if (canTransfer) tabs.push({ id: 'danger', label: '危険ゾーン', description: 'オーナー権限の移譲は取り消せません。' });
    return tabs;
}

async function renderGroupManage(content, group) {
    if (!isGroupAdmin(group) && !hasGroupPermission(group, 'profile') && !hasGroupPermission(group, 'invite') && !hasGroupPermission(group, 'ban')) {
        content.innerHTML = '<p class="error-message">このグループを管理する権限がありません。</p>';
        return;
    }
    const canProfile = hasGroupPermission(group, 'profile');
    const canInvite = hasGroupPermission(group, 'invite');
    const canBan = hasGroupPermission(group, 'ban');
    const canAdmin = isGroupAdmin(group);
    const canMembers = canAdmin || canBan;
    const canTransfer = isGroupOwner(group);
    const [memberData, requestData] = await Promise.all([
        canMembers ? request(groupPath(group.id, '/members?status=active')) : Promise.resolve({ members: [] }),
        canInvite ? request(groupPath(group.id, '/join-requests?status=pending')) : Promise.resolve({ join_requests: [] }),
    ]);
    const members = Array.isArray(memberData.members) ? memberData.members : [];
    const roles = Array.isArray(group.roles) ? group.roles : [];
    const joinRequests = Array.isArray(requestData.join_requests) ? requestData.join_requests : [];
    const groupId = escapeHTML(String(group.id));
    const tabs = renderManageTabs(group, { canProfile, canMembers, canInvite, canAdmin, canTransfer });
    const selectedTab = tabs[0]?.id || 'profile';
    content.innerHTML = `<main class="group-ui-page group-ui-manage-page">
        <header class="settings-detail-heading group-ui-page-heading"><div><h3>${escapeHTML(group.name || '')} の管理</h3><p class="settings-group-description">${escapeHTML(tabs.find((tab) => tab.id === selectedTab)?.description || '')}</p></div><a href="#group/${groupId}" class="login-secondary-button">グループへ戻る</a></header>
        <div class="settings-layout group-ui-manage-layout">
            <nav class="settings-group-list" aria-label="グループ管理項目">
                ${tabs.map((tab) => `<button type="button" class="settings-group-button ${tab.id === selectedTab ? 'active' : ''}" data-group-manage-tab="${tab.id}" data-group-manage-title="${escapeHTML(tab.label)}" data-group-manage-description="${escapeHTML(tab.description)}">${escapeHTML(tab.label)}</button>`).join('')}
            </nav>
            <div class="group-ui-manage-detail">
                ${canProfile ? `<section class="settings-group-panel" data-group-manage-panel="profile" ${selectedTab === 'profile' ? '' : 'hidden'}>${renderGroupSection('プロフィール', `<p class="settings-help-text">グループのアイコン、ヘッダー画像、名前、説明、公開レベルを編集します。</p><div class="settings-save-row"><button type="button" class="settings-primary-button" id="open-edit-group">プロフィールを編集</button></div>`)}</section>` : ''}
                ${canMembers ? `<section class="settings-group-panel" data-group-manage-panel="members" ${selectedTab === 'members' ? '' : 'hidden'}>${renderGroupSection('メンバー', `<div class="settings-sessions-list">${members.map((entry) => {
                    const member = entry.membership || {};
                    const user = entry.user || {};
                    const owner = Number(member.user_id) === Number(group.owner_id);
                    return `<article class="settings-session-item group-ui-member-row"><div class="settings-session-details"><span class="settings-session-title">${escapeHTML(user.name || `#${member.user_id}`)}${owner ? '<span class="settings-session-current">オーナー</span>' : ''}</span><p>${escapeHTML(getNyaitterId(user) || `#${member.user_id}`)}</p></div><div class="settings-session-actions">${canAdmin && !owner ? `<select class="settings-select group-ui-role-select" data-member-role="${Number(member.user_id)}" aria-label="${escapeHTML(user.name || `#${member.user_id}`)}のロール">${roles.map((role) => `<option value="${escapeHTML(String(role.id))}" ${String(role.id) === String(member.role_id) ? 'selected' : ''}>${escapeHTML(role.name)}</option>`).join('')}</select>` : ''}${canBan && !owner ? `<button type="button" class="settings-session-revoke-button" data-ban-member="${Number(member.user_id)}">禁止</button>` : ''}</div></article>`;
                }).join('') || '<p class="settings-help-text">メンバーがいません。</p>'}</div>`)}</section>` : ''}
                ${canInvite ? `<section class="settings-group-panel" data-group-manage-panel="invites" ${selectedTab === 'invites' ? '' : 'hidden'}>${renderGroupSection('ユーザーを招待', `<form id="group-invite-form" class="group-ui-inline-form"><label>NyaitterID<input name="user_id" inputmode="numeric" required placeholder="#0000の数字部分"></label><button type="submit" class="settings-primary-button">招待を送信</button></form>`)}${renderGroupSection('参加申請', joinRequests.length ? `<div class="settings-sessions-list">${joinRequests.map((item) => `<article class="settings-session-item"><div class="settings-session-details"><span class="settings-session-title">ユーザー #${Number(item.userId ?? item.user_id)}</span><p>参加申請を確認してください。</p></div><div class="settings-session-actions"><button type="button" class="settings-primary-button" data-join-request="${escapeHTML(String(item.id))}" data-decision="approve">承認</button><button type="button" class="login-secondary-button" data-join-request="${escapeHTML(String(item.id))}" data-decision="decline">拒否</button></div></article>`).join('')}</div>` : '<p class="settings-help-text">保留中の参加申請はありません。</p>')}</section>` : ''}
                ${canAdmin ? `<section class="settings-group-panel" data-group-manage-panel="roles" ${selectedTab === 'roles' ? '' : 'hidden'}>${renderGroupSection('ロール', `<div id="group-role-list" class="settings-sessions-list">${roles.map((role) => `<article class="settings-session-item"><div class="settings-session-details"><span class="settings-session-title">${escapeHTML(role.name)}${role.is_system ? '<span class="settings-session-current">システム</span>' : ''}</span><p>${(role.permissions || []).map((permission) => escapeHTML(PERMISSION_LABELS[permission] || permission)).join('、') || '権限なし'}</p></div>${role.is_system ? '' : `<div class="settings-session-actions"><button type="button" class="settings-session-revoke-button" data-delete-role="${escapeHTML(String(role.id))}">削除</button></div>`}</article>`).join('')}</div><details class="group-role-details"><summary>ロールを追加</summary><form id="group-role-form" class="group-role-form"><label>ロール名<input name="name" maxlength="50" required></label><fieldset class="group-role-permissions"><legend>権限</legend><div>${Object.entries(PERMISSION_LABELS).map(([key, label]) => `<label><input type="checkbox" name="permissions" value="${key}"> ${label}</label>`).join('')}</div></fieldset><div class="settings-save-row"><button type="submit" class="settings-primary-button">ロールを追加</button></div></form></details>`)}</section>` : ''}
                ${canTransfer ? `<section class="settings-group-panel" data-group-manage-panel="danger" ${selectedTab === 'danger' ? '' : 'hidden'}>${renderGroupSection('オーナー権限を移譲', `<form id="group-transfer-owner-form" class="group-ui-inline-form"><label>新しいオーナーのNyaitterID<input name="user_id" inputmode="numeric" required></label><button type="submit" class="settings-danger-button">権限を移譲</button></form>`, 'この操作は取り消せません。')}</section>` : ''}
            </div>
        </div>
    </main>`;
    bindGroupManageEvents(group);
}

function refreshGroupManage(group) {
    return showGroupDetailScreen(group.id, 'manage');
}

function bindGroupManageEvents(group) {
    const headingTitle = document.querySelector('.group-ui-page-heading h3');
    const headingDescription = document.querySelector('.group-ui-page-heading .settings-group-description');
    document.querySelectorAll('[data-group-manage-tab]').forEach((button) => button.addEventListener('click', () => {
        const tabId = button.dataset.groupManageTab;
        document.querySelectorAll('[data-group-manage-tab]').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
        document.querySelectorAll('[data-group-manage-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.groupManagePanel !== tabId;
        });
        if (headingTitle) headingTitle.textContent = `${group.name || ''} の${button.dataset.groupManageTitle || '管理'}`;
        if (headingDescription) headingDescription.textContent = button.dataset.groupManageDescription || '';
    }));
    document.getElementById('open-edit-group')?.addEventListener('click', () => openGroupModal(group));
    document.getElementById('group-invite-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const userId = Number(new FormData(event.currentTarget).get('user_id'));
        try {
            showLoading(true);
            await request(groupPath(group.id, '/invites'), { method: 'POST', body: { user_id: userId } });
            await showAppAlert('招待を送信しました。');
            event.currentTarget.reset();
        } catch (error) {
            showAppAlert(error.message || '招待を送信できませんでした。');
        } finally {
            showLoading(false);
        }
    });
    document.querySelectorAll('[data-join-request]').forEach((button) => button.addEventListener('click', async () => {
        try {
            showLoading(true);
            await request(groupPath(group.id, `/join-requests/${encodeURIComponent(button.dataset.joinRequest)}/respond`), { method: 'POST', body: { decision: button.dataset.decision } });
            await refreshGroupManage(group);
        } catch (error) {
            showAppAlert(error.message || '参加申請を処理できませんでした。');
        } finally {
            showLoading(false);
        }
    }));
    document.querySelectorAll('[data-member-role]').forEach((select) => select.addEventListener('change', async () => {
        try {
            showLoading(true);
            await request(groupPath(group.id, `/members/${encodeURIComponent(select.dataset.memberRole)}`), { method: 'PATCH', body: { role_id: select.value } });
            await refreshGroupManage(group);
        } catch (error) {
            showAppAlert(error.message || 'ロールを更新できませんでした。');
        } finally {
            showLoading(false);
        }
    }));
    document.querySelectorAll('[data-ban-member]').forEach((button) => button.addEventListener('click', async () => {
        if (!await showAppConfirm('このユーザーをグループから禁止しますか？')) return;
        try {
            showLoading(true);
            await request(groupPath(group.id, `/members/${encodeURIComponent(button.dataset.banMember)}/ban`), { method: 'POST', body: {} });
            await refreshGroupManage(group);
        } catch (error) {
            showAppAlert(error.message || 'ユーザーを禁止できませんでした。');
        } finally {
            showLoading(false);
        }
    }));
    document.getElementById('group-role-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
            showLoading(true);
            await request(groupPath(group.id, '/roles'), { method: 'POST', body: { name: form.get('name'), permissions: form.getAll('permissions') } });
            await refreshGroupManage(group);
        } catch (error) {
            showAppAlert(error.message || 'ロールを追加できませんでした。');
        } finally {
            showLoading(false);
        }
    });
    document.querySelectorAll('[data-delete-role]').forEach((button) => button.addEventListener('click', async () => {
        if (!await showAppConfirm('このロールを削除しますか？')) return;
        try {
            showLoading(true);
            await request(groupPath(group.id, `/roles/${encodeURIComponent(button.dataset.deleteRole)}`), { method: 'DELETE' });
            await refreshGroupManage(group);
        } catch (error) {
            showAppAlert(error.message || 'ロールを削除できませんでした。');
        } finally {
            showLoading(false);
        }
    }));
    document.getElementById('group-transfer-owner-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const userId = Number(new FormData(event.currentTarget).get('user_id'));
        if (!await showAppConfirm('オーナー権限を移譲しますか？この操作は取り消せません。')) return;
        try {
            showLoading(true);
            await request(groupPath(group.id, '/transfer-owner'), { method: 'POST', body: { user_id: userId } });
            window.location.hash = `#group/${group.id}`;
        } catch (error) {
            showAppAlert(error.message || 'オーナー権限を移譲できませんでした。');
        } finally {
            showLoading(false);
        }
    });
}

import { apiRequest } from '../api.js';
import { ICONS } from '../icons.js';
import { getCurrentUser } from '../state.js';
import { loadPostsWithPagination } from '../modules/pagination.js';
import { uploadFileViaEdgeFunction, deleteFilesViaEdgeFunction } from '../modules/posts.js';
import { initTabGroup } from '../modules/tabSwipe.js';
import { escapeHTML, getNyaitterId, getUserIconUrl, showAppAlert, showAppConfirm, showLoading } from '../utils/helpers.js';
import { showScreenCompat } from '../screenManager.js';

const VISIBILITY_LABELS = {
    open: 'Open',
    open_invite: 'OpenInvite',
    invite: 'Invite',
    private: 'Private',
};

const PERMISSION_CONFIG = [
    {
        id: 'admin',
        label: '管理者権限',
        badge: '全権限',
        description: 'グループの設定、ロール、メンバー管理を含むすべての操作を行えます。',
    },
    {
        id: 'profile',
        label: 'プロフィール編集',
        description: 'グループの名前・説明・アイコン・ヘッダー画像・公開レベルを変更できます。',
    },
    {
        id: 'invite',
        label: '招待・申請管理',
        description: '新規メンバーの招待送信や、保留中の参加申請の承認・拒否を行えます。',
    },
    {
        id: 'ban',
        label: 'メンバー追放・禁止',
        description: '迷惑行為を行うメンバーの追放および参加禁止（BAN）を行えます。',
    },
    {
        id: 'post',
        label: 'タイムライン投稿',
        description: 'グループタイムラインへの新規ポストを投稿できます。',
    },
    {
        id: 'announce',
        label: 'アナウンス投稿',
        description: 'グループメンバー全員への重要なお知らせ（アナウンス）を投稿できます。',
    },
    {
        id: 'delete',
        label: '投稿の削除',
        description: '他メンバーの投稿を含むグループ内の不適切なポストを削除できます。',
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
    showScreenCompat('groups-screen', showScreenFn);
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
                        ${editing ? '<button type="button" class="group-ui-secondary-button" id="reset-group-icon">アイコンを削除</button>' : ''}
                    </div>
                </div>
                <div class="group-modal-image-field group-modal-header-field">
                    <span class="group-modal-image-label">ヘッダー画像</span>
                    <div class="group-modal-image-actions">
                        <button type="button" class="group-modal-header-preview" id="group-header-picker" title="ヘッダー画像を選択"></button>
                        <input type="file" id="group-header-input" accept="image/*" class="hidden">
                        ${editing ? '<button type="button" class="group-ui-secondary-button" id="reset-group-header">ヘッダー画像を削除</button>' : ''}
                    </div>
                </div>
            </div>
            <label>グループ名<input name="name" maxlength="100" required value="${escapeHTML(group?.name || '')}" placeholder="グループ名"></label>
            <label>説明<textarea name="description" maxlength="2000" rows="4" placeholder="グループの説明">${escapeHTML(group?.description || '')}</textarea></label>
            <label>公開レベル<select name="visibility" class="settings-select">${visibilityOptions(group?.visibility || 'open')}</select></label>
            <div class="settings-save-row"><button type="button" class="group-ui-secondary-button group-modal-cancel-button" data-close-group-modal>キャンセル</button><button type="submit" class="settings-primary-button">${editing ? '変更を保存' : '作成'}</button></div>
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
                <div><h3>グループ</h3><p class="settings-group-description">グループは共通の話題でポスト可能なスペースです。</p></div>
                <button type="button" class="settings-primary-button" id="open-create-group">グループを作成</button>
            </header>
            ${invites.length ? renderGroupSection('グループ招待', `<div class="settings-sessions-list">${invites.map((invite) => `<article class="settings-session-item group-ui-invite-item"><div class="settings-session-details"><span class="settings-session-title">${escapeHTML(invite.group?.name || 'グループ')}</span><p>グループへの招待が届いています。</p></div><div class="settings-session-actions"><button type="button" class="settings-primary-button" data-group-invite="${escapeHTML(String(invite.id))}" data-decision="accept">参加</button><button type="button" class="group-ui-secondary-button" data-group-invite="${escapeHTML(String(invite.id))}" data-decision="decline">拒否</button></div></article>`).join('')}</div>`) : ''}
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

export async function showGroupDetailScreen(groupId, section = 'overview', showScreenFn = null, initialManageTab = null) {
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
        if (section === 'manage') await renderGroupManage(content, group, initialManageTab || 'profile');
        else renderGroupOverview(content, group, data.join_request || null);
    } catch (error) {
        content.innerHTML = `<p class="error-message">グループを読み込めませんでした。${escapeHTML(error.message || '')}</p>`;
    } finally {
        showLoading(false);
    }
}

function renderGroupOverview(content, group, pendingJoinRequest = null) {
    const membership = group.membership;
    const isActive = membership?.status === 'active';
    const hasPendingJoinRequest = Boolean(pendingJoinRequest);
    const isApprovalRequired = group.visibility === 'open_invite' || group.visibility === 'invite';
    const canJoin = !membership || (membership.status === 'pending' && !isApprovalRequired);
    const canManage = isGroupAdmin(group) || hasGroupPermission(group, 'profile') || hasGroupPermission(group, 'invite') || hasGroupPermission(group, 'ban');
    const groupId = escapeHTML(String(group.id));
    const joinBtnText = isApprovalRequired ? '参加申請する' : '参加する';
    content.innerHTML = `<main class="group-ui-page">
        <section class="group-ui-profile">
            ${groupHeader(group)}
            <div class="group-ui-profile-main">
                ${groupAvatar(group, 'group-ui-profile-avatar')}
                <div class="group-ui-profile-copy"><h3>${escapeHTML(group.name || '')}</h3><p class="settings-group-description">${groupMeta(group)}</p><p>${escapeHTML(group.description || '説明はありません。')}</p></div>
                <div class="group-ui-profile-actions">
                    ${canJoin && !hasPendingJoinRequest ? `<button type="button" class="settings-primary-button" id="join-group-btn">${joinBtnText}</button>` : ''}
                    ${hasPendingJoinRequest ? '<button type="button" class="settings-primary-button" disabled aria-disabled="true">承認待ち</button>' : ''}
                    ${membership?.status === 'invited' ? '<span class="settings-session-current">招待に応答してください</span>' : ''}
                    ${isActive && !isGroupOwner(group) ? '<button type="button" class="group-ui-secondary-button" id="leave-group-btn">退出する</button>' : ''}
                    ${canManage ? `<a class="group-ui-secondary-button" href="#group/${groupId}/manage">管理</a>` : ''}
                </div>
            </div>
        </section>
        ${isActive ? `<section class="group-ui-posts"><div class="timeline-tabs-sticky-container group-ui-post-tabs"><div class="timeline-tabs" role="tablist" aria-label="投稿の表示"><button type="button" class="group-post-tab-button active" data-group-post-mode="all" role="tab" aria-selected="true">すべて</button><button type="button" class="group-post-tab-button" data-group-post-mode="recommended" role="tab" aria-selected="false">おすすめ</button><button type="button" class="group-post-tab-button" data-group-post-mode="announcements" role="tab" aria-selected="false">アナウンス</button></div></div><div id="group-detail-posts"></div></section>` : '<p class="settings-help-text">投稿は参加者だけが閲覧できます。</p>'}
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
            initTabGroup({
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
}

async function joinGroup(group) {
    try {
        showLoading(true);
        const data = await request(groupPath(group.id, '/join'), { method: 'POST', body: {} });
        if (data.pending) await showAppAlert('参加申請を送信しました。');
        await showGroupDetailScreen(group.id);
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
        await showGroupDetailScreen(group.id);
    } catch (error) {
        showAppAlert(error.message || '退出できませんでした。');
    } finally {
        showLoading(false);
    }
}

const VISIBILITY_CONFIG = [
    {
        id: 'open',
        label: 'Open',
        badge: '誰でも参加可能・検索可能',
        description: 'グループ一覧や検索に表示され、誰でも自由に参加できます。',
    },
    {
        id: 'open_invite',
        label: 'OpenInvite',
        badge: '参加に承認が必要・検索可能',
        description: 'グループ一覧や検索に表示されますが、参加には管理者の承認が必要です。',
    },
    {
        id: 'private',
        label: 'Private',
        badge: '誰でも参加可能・検索不可能',
        description: 'グループ一覧や検索には表示されませんが、リンクを知っていれば誰でも自由に参加できます。',
    },
    {
        id: 'invite',
        label: 'Invite',
        badge: '参加に承認が必要・検索不可能',
        description: 'グループ一覧や検索には表示されず、参加には招待または管理者の承認が必要です。',
    },
];

function renderVisibilityCards(currentVisibility = 'open') {
    return `<div class="group-visibility-grid">
        ${VISIBILITY_CONFIG.map((vis) => {
            const isSelected = vis.id === currentVisibility;
            return `<label class="group-visibility-card ${isSelected ? 'is-selected' : ''}" data-visibility-card="${vis.id}">
                <input type="radio" name="visibility" value="${vis.id}" ${isSelected ? 'checked' : ''}>
                <div class="group-visibility-card-header">
                    <span>${escapeHTML(vis.label)}</span>
                    <span class="group-visibility-card-badge">${escapeHTML(vis.badge)}</span>
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
    return `<form id="group-profile-form" class="group-ui-form group-profile-form">
        <label for="group-profile-name">グループ名</label>
        <input id="group-profile-name" name="name" maxlength="100" required value="${escapeHTML(group?.name || '')}">
        <label for="group-profile-icon-input">アイコン</label>
        <div class="group-profile-image-actions">
            <button type="button" class="group-profile-icon-preview" id="group-profile-icon-picker" title="クリックして画像を選択">${iconUrl ? `<img src="${escapeHTML(iconUrl)}" alt="アイコンのプレビュー">` : `<span aria-hidden="true">${ICONS.group}</span>`}</button>
            <button type="button" class="group-ui-secondary-button" id="reset-group-profile-icon">アイコンを削除</button>
        </div>
        <input type="file" id="group-profile-icon-input" accept="image/*" class="hidden">
        <label for="group-profile-header-input">ヘッダー画像</label>
        <div class="group-profile-image-actions group-profile-header-actions">
            <button type="button" class="group-profile-header-preview ${headerUrl ? '' : 'is-empty'}" id="group-profile-header-picker" title="クリックして画像を選択">${headerUrl ? `<img src="${escapeHTML(headerUrl)}" alt="ヘッダー画像のプレビュー">` : '<span>ヘッダー画像を選択</span>'}</button>
            <button type="button" class="group-ui-secondary-button" id="reset-group-profile-header">ヘッダー画像を削除</button>
        </div>
        <input type="file" id="group-profile-header-input" accept="image/*" class="hidden">
        <label for="group-profile-description">説明</label>
        <textarea id="group-profile-description" name="description" maxlength="2000" rows="4">${escapeHTML(group?.description || '')}</textarea>
        <label>公開レベル</label>
        ${renderVisibilityCards(currentVis)}
    </form>`;
}

const DEFAULT_ROLE_SORT_ORDERS = { owner: 0, admin: 1, member: 2 };
const DEFAULT_ROLE_LABELS = { owner: 'オーナー', admin: '管理者', member: 'メンバー' };

function getDefaultRoleType(role) {
    if (!Boolean(role?.is_system ?? role?.isSystem)) return null;
    const sortOrder = Number(role?.sort_order ?? role?.sortOrder);
    return Object.entries(DEFAULT_ROLE_SORT_ORDERS).find(([, value]) => value === sortOrder)?.[0]
        || Object.keys(DEFAULT_ROLE_SORT_ORDERS).find((type) => role?.name === type)
        || 'system';
}

function renderRolePermissionCards(role = null) {
    const assignedPermissions = new Set(Array.isArray(role?.permissions) ? role.permissions : []);
    const checkIcon = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"></polyline></svg>`;
    return PERMISSION_CONFIG.map((perm) => {
        const isChecked = assignedPermissions.has(perm.id);
        return `<label class="group-role-perm-tile ${isChecked ? 'is-checked' : ''}">
            <input type="checkbox" name="permissions" value="${escapeHTML(perm.id)}" ${isChecked ? 'checked' : ''} class="group-role-perm-checkbox">
            <div class="group-role-perm-tile-inner">
                <div class="group-role-perm-tile-check">${checkIcon}</div>
                <div class="group-role-perm-tile-info">
                    <div class="group-role-perm-tile-title">
                        <strong>${escapeHTML(perm.label)}</strong>
                        ${perm.badge ? `<span class="group-role-perm-badge">${escapeHTML(perm.badge)}</span>` : ''}
                    </div>
                    <p class="group-role-perm-tile-desc">${escapeHTML(perm.description)}</p>
                </div>
            </div>
        </label>`;
    }).join('');
}

function renderRoleChips(role, isOwner) {
    if (isOwner) {
        return '<span class="group-role-chip is-admin">すべての権限（オーナー固定）</span>';
    }
    const permissions = Array.isArray(role?.permissions) ? role.permissions : [];
    if (permissions.includes('admin')) {
        return '<span class="group-role-chip is-admin">すべての権限（管理者）</span>';
    }
    if (permissions.length === 0) {
        return '<span class="group-role-chip is-empty">権限なし</span>';
    }
    return permissions.map((permId) => {
        const perm = PERMISSION_CONFIG.find((p) => p.id === permId);
        const label = perm?.label || permId;
        return `<span class="group-role-chip">${escapeHTML(label)}</span>`;
    }).join('');
}

function renderRoleCard(role) {
    const roleId = escapeHTML(String(role.id));
    const roleType = getDefaultRoleType(role);
    const ownerRole = roleType === 'owner';
    const defaultRole = Boolean(roleType);
    const roleName = escapeHTML(role.name || '無題のロール');
    
    let badgeHtml = '';
    if (ownerRole) {
        badgeHtml = '<span class="settings-session-current group-role-badge-owner">オーナー</span>';
    } else if (roleType === 'admin') {
        badgeHtml = '<span class="settings-session-current group-role-badge-admin">管理者・既定</span>';
    } else if (defaultRole) {
        badgeHtml = '<span class="settings-session-current group-role-badge-default">メンバー・既定</span>';
    } else {
        badgeHtml = '<span class="settings-session-current group-role-badge-custom">カスタム</span>';
    }

    return `<article class="group-role-card ${ownerRole ? 'is-owner-role' : ''}" id="role-card-${roleId}" data-role-id="${roleId}">
        <div class="group-role-card-summary">
            <div class="group-role-summary-main">
                <div class="group-role-title-row">
                    <h5 class="group-role-title" data-role-title="${roleId}">${roleName}</h5>
                    ${badgeHtml}
                </div>
                <div class="group-role-perm-preview" data-role-preview="${roleId}">
                    ${renderRoleChips(role, ownerRole)}
                </div>
            </div>
            <div class="group-role-summary-actions">
                ${ownerRole ? '<span class="group-role-locked-tag">変更不可</span>' : `
                    <button type="button" class="group-ui-secondary-button group-role-edit-toggle-btn" data-toggle-role="${roleId}">
                        <span class="edit-text">編集</span>
                        <span class="close-text hidden">閉じる</span>
                    </button>
                    ${defaultRole ? '' : `<button type="button" class="settings-session-revoke-button group-role-delete-btn" data-delete-role="${roleId}">削除</button>`}
                `}
            </div>
        </div>
        ${ownerRole ? '' : `
        <div class="group-role-editor-pane hidden" id="role-editor-${roleId}">
            <form class="group-role-edit-form" data-edit-group-role="${roleId}">
                <div class="group-role-input-group">
                    <label class="group-role-input-label" for="role-name-${roleId}">ロール名</label>
                    <input id="role-name-${roleId}" name="name" maxlength="50" required value="${roleName}" class="group-role-name-input">
                </div>
                <div class="group-role-perm-section">
                    <div class="group-role-perm-header">
                        <span class="group-role-input-label">許可する操作</span>
                        <span class="settings-help-text">チェックした権限がこのロールに付与されます</span>
                    </div>
                    <div class="group-role-perm-grid">
                        ${renderRolePermissionCards(role)}
                    </div>
                </div>
                <div class="group-role-card-actions">
                    <span class="group-role-save-status" id="save-status-${roleId}"></span>
                    <button type="button" class="group-ui-secondary-button" data-cancel-role="${roleId}">閉じる</button>
                    <button type="submit" class="settings-primary-button group-role-save-btn">変更を保存</button>
                </div>
            </form>
        </div>
        `}
    </article>`;
}

function renderRolesPanel(group) {
    const roles = Array.isArray(group.roles) ? group.roles : [];
    return `<div class="group-roles-container">
        <div class="group-roles-header">
            <div class="group-roles-header-text">
                <p class="settings-help-text">ロールごとにメンバーへ付与する権限を設定できます。オーナー以外のロールは名前や権限のカスタマイズが可能です。</p>
            </div>
            <button type="button" class="settings-primary-button group-role-add-btn" id="toggle-create-role-btn">
                + ロールを追加
            </button>
        </div>

        <div id="group-role-create-wrapper" class="group-role-create-wrapper hidden">
            <form id="group-role-form" class="group-role-card group-role-create-card">
                <div class="group-role-card-header">
                    <div class="group-role-card-title-wrap">
                        <h5 class="group-role-card-title">新しいロールを作成</h5>
                        <span class="settings-session-current group-role-badge-custom">カスタム</span>
                    </div>
                    <button type="button" class="modal-close-btn group-role-create-close-btn" id="cancel-create-role-btn" aria-label="閉じる">×</button>
                </div>
                <div class="group-role-input-group">
                    <label for="create-role-name" class="group-role-input-label">ロール名</label>
                    <input id="create-role-name" name="name" maxlength="50" required placeholder="例: モデレーター、広報担当" class="group-role-name-input">
                </div>
                <div class="group-role-perm-section">
                    <div class="group-role-perm-header">
                        <span class="group-role-input-label">付与する権限を選択</span>
                        <span class="settings-help-text">必要な操作だけにチェックを付けてください</span>
                    </div>
                    <div class="group-role-perm-grid">
                        ${renderRolePermissionCards()}
                    </div>
                </div>
                <div class="group-role-card-actions">
                    <button type="button" class="group-ui-secondary-button" id="cancel-create-role-btn-action">キャンセル</button>
                    <button type="submit" class="settings-primary-button">ロールを作成</button>
                </div>
            </form>
        </div>

        <div class="group-role-list">
            ${roles.map((role) => renderRoleCard(role)).join('')}
        </div>
    </div>`;
}

function renderManageTabs(group, { canProfile, canMembers, canInvite, canAdmin, canTransfer }) {
    const tabs = [];
    if (canProfile) tabs.push({ id: 'profile', label: 'プロフィール', description: 'グループの名前、説明、公開レベル、画像を管理します。' });
    if (canMembers) tabs.push({ id: 'members', label: 'メンバー', description: 'メンバーのロール変更と参加禁止を管理します。' });
    if (canInvite) tabs.push({ id: 'invites', label: '招待・申請', description: 'ユーザーの招待と参加申請を管理します。' });
    if (canAdmin) tabs.push({ id: 'roles', label: 'ロール', description: 'ロールと権限を管理します。' });
    if (canTransfer) tabs.push({ id: 'danger', label: '危険ゾーン', description: 'オーナー権限の移譲とグループ削除は取り消せません。' });
    return tabs;
}

async function renderGroupManage(content, group, initialTab = 'profile') {
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
    const selectedTab = tabs.some((tab) => tab.id === initialTab) ? initialTab : (tabs[0]?.id || 'profile');
    content.innerHTML = `<main class="group-ui-page group-ui-manage-page">
        <header class="settings-detail-heading group-ui-page-heading">
            <div>
                <h3>${escapeHTML(group.name || '')} の管理</h3>
                <p class="settings-group-description">${escapeHTML(tabs.find((tab) => tab.id === selectedTab)?.description || '')}</p>
            </div>
            <a href="#group/${groupId}" class="group-ui-secondary-button">グループへ戻る</a>
        </header>
        <div class="settings-layout group-ui-manage-layout">
            <nav class="settings-group-list" aria-label="グループ管理項目">
                ${tabs.map((tab) => `<button type="button" class="settings-group-button ${tab.id === selectedTab ? 'active' : ''}" data-group-manage-tab="${tab.id}" data-group-manage-title="${escapeHTML(tab.label)}" data-group-manage-description="${escapeHTML(tab.description)}">${escapeHTML(tab.label)}</button>`).join('')}
            </nav>
            <div class="group-ui-manage-detail">
                ${canProfile ? `<section class="settings-group-panel" data-group-manage-panel="profile" ${selectedTab === 'profile' ? '' : 'hidden'}>${renderGroupSection('基本設定', renderGroupProfileForm(group), 'グループのアイコン、ヘッダー画像、名前、説明、公開レベルを編集します。')}</section>` : ''}
                ${canMembers ? `<section class="settings-group-panel" data-group-manage-panel="members" ${selectedTab === 'members' ? '' : 'hidden'}>${renderGroupSection('メンバー管理', `
                    <div class="group-members-toolbar">
                        <input type="search" class="group-members-search-input" id="group-member-search" placeholder="メンバーを検索 (名前・ID)" aria-label="メンバー検索">
                        <span class="settings-help-text" id="group-member-count-label">全 ${members.length} 名</span>
                    </div>
                    <div class="group-members-list" id="group-members-list">${members.map((entry) => {
                        const member = entry.membership || {};
                        const user = entry.user || {};
                        const owner = Number(member.user_id) === Number(group.owner_id);
                        const memberName = escapeHTML(user.name || `ユーザー #${member.user_id}`);
                        const handle = escapeHTML(getNyaitterId(user) || `#${member.user_id}`);
                        const avatarUrl = getUserIconUrl(user);
                        return `<article class="group-member-item" data-member-id="${Number(member.user_id)}" data-member-search-text="${(user.name || '').toLowerCase()} ${String(member.user_id)}">
                            <div class="group-member-info">
                                <img src="${escapeHTML(avatarUrl)}" class="group-member-avatar" alt="">
                                <div class="group-member-details">
                                    <div class="group-member-name-row">
                                        <span class="group-member-name">${memberName}</span>
                                        ${owner ? '<span class="settings-session-current group-role-badge-owner">オーナー</span>' : ''}
                                    </div>
                                    <span class="group-member-handle">${handle}</span>
                                </div>
                            </div>
                            <div class="group-member-actions">
                                ${canAdmin && !owner ? `<select class="settings-select group-ui-role-select" data-member-role="${Number(member.user_id)}" aria-label="${memberName}のロール">${roles.map((role) => `<option value="${escapeHTML(String(role.id))}" ${String(role.id) === String(member.role_id) ? 'selected' : ''}>${escapeHTML(role.name)}</option>`).join('')}</select>` : ''}
                                ${canBan && !owner ? `<button type="button" class="settings-session-revoke-button" data-ban-member="${Number(member.user_id)}">禁止</button>` : ''}
                            </div>
                        </article>`;
                    }).join('') || '<p class="settings-help-text">メンバーがいません。</p>'}</div>
                `, 'グループに参加しているメンバーのロール変更やモデレーションを行います。')}</section>` : ''}
                ${canInvite ? `<section class="settings-group-panel" data-group-manage-panel="invites" ${selectedTab === 'invites' ? '' : 'hidden'}>
                    ${renderGroupSection('ユーザーを招待', `
                        <form id="group-invite-form" class="group-ui-inline-form">
                            <label>NyaitterID<input name="user_id" inputmode="numeric" required placeholder="#0000の数字部分"></label>
                            <button type="submit" class="settings-primary-button">招待を送信</button>
                        </form>
                    `, 'IDを指定してグループにメンバーを直接招待します。')}
                    ${renderGroupSection('保留中の参加申請', joinRequests.length ? `
                        <div class="group-requests-list">${joinRequests.map((item) => {
                            const reqUser = item.user || {};
                            const reqUserId = Number(item.userId ?? item.user_id);
                            const reqName = escapeHTML(reqUser.name || `ユーザー #${reqUserId}`);
                            const reqAvatar = getUserIconUrl(reqUser);
                            return `<article class="group-request-card">
                                <div class="group-member-info">
                                    <img src="${escapeHTML(reqAvatar)}" class="group-member-avatar" alt="">
                                    <div class="group-member-details">
                                        <span class="group-member-name">${reqName}</span>
                                        <span class="group-member-handle">${escapeHTML(getNyaitterId(reqUser) || `#${reqUserId}`)}</span>
                                    </div>
                                </div>
                                <div class="group-request-actions">
                                    <button type="button" class="settings-primary-button" data-join-request="${escapeHTML(String(item.id))}" data-decision="approve">承認</button>
                                    <button type="button" class="group-ui-secondary-button" data-join-request="${escapeHTML(String(item.id))}" data-decision="decline">拒否</button>
                                </div>
                            </article>`;
                        }).join('')}</div>
                    ` : '<p class="settings-help-text">保留中の参加申請はありません。</p>', 'グループへの参加申請を承認または拒否します。')}
                </section>` : ''}
                ${canAdmin ? `<section class="settings-group-panel" data-group-manage-panel="roles" ${selectedTab === 'roles' ? '' : 'hidden'}>${renderGroupSection('ロールと権限', renderRolesPanel(group), 'グループ内の権限とロールを設定します。')}</section>` : ''}
                ${canTransfer ? `<section class="settings-group-panel" data-group-manage-panel="danger" ${selectedTab === 'danger' ? '' : 'hidden'}>
                    <div class="group-danger-card">
                        <h4 class="group-danger-card-title">オーナー権限を移譲</h4>
                        <p class="group-danger-card-desc">グループの最高権限を別のメンバーに移譲します。移譲後は一般管理者ロールに変更されます。この操作は取り消せません。</p>
                        <form id="group-transfer-owner-form" class="group-ui-inline-form">
                            <label>新しいオーナーのNyaitterID<input name="user_id" inputmode="numeric" required placeholder="#0000の数字部分"></label>
                            <button type="submit" class="settings-danger-button">権限を移譲</button>
                        </form>
                    </div>
                    <div class="group-danger-card" style="margin-top: 1rem;">
                        <h4 class="group-danger-card-title">グループを完全に削除</h4>
                        <p class="group-danger-card-desc">グループと紐づくすべてのポスト、メンバーシップ、設定が完全に削除されます。この操作は絶対に取り消せません。</p>
                        <div>
                            <button type="button" id="delete-group-button" class="settings-danger-button">グループを削除</button>
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
    const visibilityInput = document.getElementById('group-profile-visibility');
    const iconInput = document.getElementById('group-profile-icon-input');
    const headerInput = document.getElementById('group-profile-header-input');
    const iconPreview = document.getElementById('group-profile-icon-picker');
    const headerPreview = document.getElementById('group-profile-header-picker');
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
        || String(visibilityInput?.value || '') !== savedVisibility
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
        document.getElementById('page-title')?.replaceChildren(document.createTextNode(savedName || 'グループ'));
        const heading = document.querySelector('.group-ui-page-heading h3');
        if (heading) heading.textContent = `${savedName} の${document.querySelector('[data-group-manage-tab].active')?.dataset.groupManageTitle || '管理'}`;
    };

    const saveProfile = async () => {
        if (saveInFlight) {
            saveQueued = true;
            return;
        }
        if (!hasPendingChanges() || !form.reportValidity()) return;
        saveInFlight = true;
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
            if (previousFileIds.size > 0) {
                void deleteFilesViaEdgeFunction([...previousFileIds]).catch((error) => {
                    console.warn('グループの古い画像を削除できませんでした。', error);
                });
            }
        } catch (error) {
            if (uploadedFileIds.length > 0) {
                await deleteFilesViaEdgeFunction(uploadedFileIds).catch(() => {});
            }
            showAppAlert(error.message || 'プロフィールを更新できませんでした。');
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
            void saveProfile();
        } catch (error) {
            showAppAlert(error.message || 'ヘッダー画像を選択できませんでした。');
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
        initTabGroup({
            container: tabsContainer,
            tabSelector: '[data-group-manage-tab]',
            contentContainer: manageDetail,
            getTabKey: (button) => button.dataset.groupManageTab,
            onTabChange: (tabId, button) => {
                document.querySelectorAll('[data-group-manage-panel]').forEach((panel) => {
                    panel.hidden = panel.dataset.groupManagePanel !== tabId;
                });
                if (headingTitle) headingTitle.textContent = `${group.name || ''} の${button.dataset.groupManageTitle || '管理'}`;
                if (headingDescription) headingDescription.textContent = button.dataset.groupManageDescription || '';
            },
        });
    }
    bindGroupProfileForm(group);

    // メンバーのインクリメンタル検索
    const memberSearchInput = document.getElementById('group-member-search');
    const memberItems = document.querySelectorAll('.group-member-item');
    const memberCountLabel = document.getElementById('group-member-count-label');
    if (memberSearchInput) {
        memberSearchInput.addEventListener('input', () => {
            const query = memberSearchInput.value.trim().toLowerCase();
            let visibleCount = 0;
            memberItems.forEach((item) => {
                const searchText = (item.dataset.memberSearchText || '').toLowerCase();
                const matches = !query || searchText.includes(query);
                item.style.display = matches ? 'flex' : 'none';
                if (matches) visibleCount += 1;
            });
            if (memberCountLabel) {
                memberCountLabel.textContent = query
                    ? `${visibleCount} / ${memberItems.length} 名`
                    : `全 ${memberItems.length} 名`;
            }
        });
    }
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
            await refreshGroupManage(group, 'members');
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
            await refreshGroupManage(group, 'members');
        } catch (error) {
            showAppAlert(error.message || 'ユーザーを禁止できませんでした。');
        } finally {
            showLoading(false);
        }
    }));

    // ロール権限チェックボックスのリアルタイム表示切り替え
    document.querySelectorAll('.group-role-perm-checkbox').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
            const tile = checkbox.closest('.group-role-perm-tile');
            if (tile) tile.classList.toggle('is-checked', checkbox.checked);
        });
    });

    // ロール編集ペインの開閉
    document.querySelectorAll('[data-toggle-role]').forEach((button) => {
        button.addEventListener('click', () => {
            const roleId = button.dataset.toggleRole;
            const editor = document.getElementById(`role-editor-${roleId}`);
            if (!editor) return;
            const isHidden = editor.classList.contains('hidden');
            editor.classList.toggle('hidden', !isHidden);
            button.querySelector('.edit-text')?.classList.toggle('hidden', isHidden);
            button.querySelector('.close-text')?.classList.toggle('hidden', !isHidden);
        });
    });

    document.querySelectorAll('[data-cancel-role]').forEach((button) => {
        button.addEventListener('click', () => {
            const roleId = button.dataset.cancelRole;
            const editor = document.getElementById(`role-editor-${roleId}`);
            const toggleBtn = document.querySelector(`[data-toggle-role="${roleId}"]`);
            if (editor) editor.classList.add('hidden');
            if (toggleBtn) {
                toggleBtn.querySelector('.edit-text')?.classList.remove('hidden');
                toggleBtn.querySelector('.close-text')?.classList.add('hidden');
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
        submitBtn.textContent = '保存中';
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
                    statusEl.textContent = '✓ 保存しました';
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(() => {
                        if (statusEl) statusEl.textContent = '';
                    }, 3000);
                }
            } catch (error) {
                showAppAlert(error.message || 'ロールを更新できませんでした。');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '変更を保存';
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
            showAppAlert(error.message || 'ロールを追加できませんでした。');
        } finally {
            showLoading(false);
        }
    });

    // ロール削除
    document.querySelectorAll('[data-delete-role]').forEach((button) => button.addEventListener('click', async () => {
        if (!await showAppConfirm('このロールを削除しますか？この操作は取り消せません。')) return;
        try {
            showLoading(true);
            await request(groupPath(group.id, `/roles/${encodeURIComponent(button.dataset.deleteRole)}`), { method: 'DELETE' });
            await refreshGroupManage(group, 'roles');
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
    document.getElementById('delete-group-button')?.addEventListener('click', async () => {
        if (!await showAppConfirm(`「${group.name || 'このグループ'}」を削除しますか？紐づくポストもすべて削除されます。`)) return;
        if (!await showAppConfirm('この操作は取り消せません。本当にグループを削除しますか？')) return;
        try {
            showLoading(true);
            await request(groupPath(group.id), { method: 'DELETE' });
            window.location.hash = '#groups';
        } catch (error) {
            showAppAlert(error.message || 'グループを削除できませんでした。');
        } finally {
            showLoading(false);
        }
    });
}

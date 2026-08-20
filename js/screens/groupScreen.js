import { apiRequest } from '../api.js';
import { ICONS } from '../icons.js';
import { getCurrentUser } from '../state.js';
import { loadPostsWithPagination } from '../modules/pagination.js';
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

function visibilityOptions(selected = 'open') {
    return Object.entries(VISIBILITY_LABELS)
        .map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`)
        .join('');
}

function groupAvatar(group, className = 'group-ui-avatar') {
    if (group?.icon_data) {
        return `<img class="${className}" src="${escapeHTML(group.icon_data)}" alt="">`;
    }
    return `<div class="${className} group-ui-avatar-fallback" aria-hidden="true">${ICONS.group}</div>`;
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
                <div><h3>グループ</h3><p class="settings-group-description">グループ投稿は参加者だけが閲覧できます。</p></div>
                <button type="button" class="settings-primary-button" id="open-create-group">グループを作成</button>
            </header>
            <form id="create-group-form" class="group-ui-form hidden">
                <label>グループ名<input name="name" maxlength="100" required placeholder="グループ名"></label>
                <label>説明<textarea name="description" maxlength="2000" rows="3" placeholder="グループの説明"></textarea></label>
                <label>公開レベル<select name="visibility" class="settings-select">${visibilityOptions('open')}</select></label>
                <div class="settings-save-row"><button type="button" class="login-secondary-button" id="cancel-create-group">キャンセル</button><button type="submit" class="settings-primary-button">作成</button></div>
            </form>
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
    const createForm = document.getElementById('create-group-form');
    document.getElementById('open-create-group')?.addEventListener('click', () => createForm?.classList.remove('hidden'));
    document.getElementById('cancel-create-group')?.addEventListener('click', () => createForm?.classList.add('hidden'));
    createForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(createForm);
        try {
            showLoading(true);
            const data = await request('/server/api/groups', {
                method: 'POST',
                body: { name: form.get('name'), description: form.get('description'), visibility: form.get('visibility') },
            });
            window.location.hash = `#group/${data.group.id}`;
        } catch (error) {
            showAppAlert(error.message || 'グループを作成できませんでした。');
        } finally {
            showLoading(false);
        }
    });
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
            ${groupAvatar(group, 'group-ui-profile-avatar')}
            <div class="group-ui-profile-copy"><h3>${escapeHTML(group.name || '')}</h3><p class="settings-group-description">${groupMeta(group)}</p><p>${escapeHTML(group.description || '説明はありません。')}</p></div>
            <div class="group-ui-profile-actions">
                ${!membership ? '<button type="button" class="settings-primary-button" id="join-group-btn">参加する</button>' : ''}
                ${membership?.status === 'pending' ? '<span class="settings-session-current">参加申請を確認中</span>' : ''}
                ${membership?.status === 'invited' ? '<span class="settings-session-current">招待に応答してください</span>' : ''}
                ${isActive && Number(group.owner_id) !== Number(getCurrentUser()?.id) ? '<button type="button" class="login-secondary-button" id="leave-group-btn">退出する</button>' : ''}
                ${canManage ? `<a class="login-secondary-button" href="#group/${groupId}/manage">管理</a>` : ''}
            </div>
        </section>
        ${renderGroupSection('グループ投稿', isActive ? `<div class="group-ui-tabs" role="tablist"><button type="button" class="active" data-group-post-mode="all">すべて</button><button type="button" data-group-post-mode="recommended">おすすめ</button><button type="button" data-group-post-mode="announcements">アナウンス</button></div><div id="group-detail-posts"></div>` : '<p class="settings-help-text">グループ投稿は参加者だけが閲覧できます。</p>')}
    </main>`;
    if (isActive) {
        const postContainer = document.getElementById('group-detail-posts');
        const loadGroupPosts = (mode = 'all') => {
            if (!postContainer) return;
            postContainer.innerHTML = '';
            document.querySelectorAll('[data-group-post-mode]').forEach((button) => button.classList.toggle('active', button.dataset.groupPostMode === mode));
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

async function renderGroupManage(content, group) {
    if (!isGroupAdmin(group) && !hasGroupPermission(group, 'profile') && !hasGroupPermission(group, 'invite') && !hasGroupPermission(group, 'ban')) {
        content.innerHTML = '<p class="error-message">このグループを管理する権限がありません。</p>';
        return;
    }
    const canProfile = hasGroupPermission(group, 'profile');
    const canInvite = hasGroupPermission(group, 'invite');
    const canBan = hasGroupPermission(group, 'ban');
    const canAdmin = isGroupAdmin(group);
    const [memberData, requestData] = await Promise.all([
        request(groupPath(group.id, '/members?status=active')),
        canInvite ? request(groupPath(group.id, '/join-requests?status=pending')) : Promise.resolve({ join_requests: [] }),
    ]);
    const members = Array.isArray(memberData.members) ? memberData.members : [];
    const roles = Array.isArray(group.roles) ? group.roles : [];
    const requests = Array.isArray(requestData.join_requests) ? requestData.join_requests : [];
    const groupId = escapeHTML(String(group.id));
    content.innerHTML = `<main class="group-ui-page group-ui-manage-page">
        <header class="settings-detail-heading group-ui-page-heading"><div><h3>${escapeHTML(group.name || '')} の管理</h3><p class="settings-group-description">グループのプロフィール、参加者、ロールを管理します。</p></div><a href="#group/${groupId}" class="login-secondary-button">グループへ戻る</a></header>
        ${canProfile ? renderGroupSection('プロフィール', `<form id="group-profile-form" class="group-ui-form"><label>グループ名<input name="name" maxlength="100" value="${escapeHTML(group.name || '')}" required></label><label>説明<textarea name="description" maxlength="2000" rows="4">${escapeHTML(group.description || '')}</textarea></label><label>公開レベル<select name="visibility" class="settings-select">${visibilityOptions(group.visibility)}</select></label><div class="settings-save-row"><button type="submit" class="settings-primary-button">保存</button></div></form>`) : ''}
        ${canInvite ? renderGroupSection('ユーザーを招待', `<form id="group-invite-form" class="group-ui-inline-form"><label>NyaitterID<input name="user_id" inputmode="numeric" required placeholder="#0000の数字部分"></label><button type="submit" class="settings-primary-button">招待を送信</button></form>`) : ''}
        ${canInvite && requests.length ? renderGroupSection('参加申請', `<div class="settings-sessions-list">${requests.map((item) => `<article class="settings-session-item"><div class="settings-session-details"><span class="settings-session-title">ユーザー #${Number(item.userId ?? item.user_id)}</span><p>参加申請を確認してください。</p></div><div class="settings-session-actions"><button type="button" class="settings-primary-button" data-join-request="${escapeHTML(String(item.id))}" data-decision="approve">承認</button><button type="button" class="login-secondary-button" data-join-request="${escapeHTML(String(item.id))}" data-decision="decline">拒否</button></div></article>`).join('')}</div>`) : ''}
        ${renderGroupSection('メンバー', `<div class="settings-sessions-list">${members.map((entry) => {
            const member = entry.membership || {}; const user = entry.user || {}; const isOwner = Number(member.user_id) === Number(group.owner_id);
            return `<article class="settings-session-item group-ui-member-row"><div class="settings-session-details"><span class="settings-session-title">${escapeHTML(user.name || `#${member.user_id}`)}${isOwner ? '<span class="settings-session-current">オーナー</span>' : ''}</span><p>${escapeHTML(getNyaitterId(user) || `#${member.user_id}`)}</p></div><div class="settings-session-actions">${canAdmin && !isOwner ? `<select class="settings-select group-ui-role-select" data-member-role="${Number(member.user_id)}">${roles.map((role) => `<option value="${escapeHTML(String(role.id))}" ${String(role.id) === String(member.role_id) ? 'selected' : ''}>${escapeHTML(role.name)}</option>`).join('')}</select>` : ''}${canBan && !isOwner ? `<button type="button" class="settings-session-revoke-button" data-ban-member="${Number(member.user_id)}">禁止</button>` : ''}</div></article>`;
        }).join('') || '<p class="settings-help-text">メンバーがいません。</p>'}</div>`) }
        ${canAdmin ? `${renderGroupSection('ロール', `<div id="group-role-list" class="settings-sessions-list">${roles.map((role) => `<article class="settings-session-item"><div class="settings-session-details"><span class="settings-session-title">${escapeHTML(role.name)}${role.is_system ? '<span class="settings-session-current">システム</span>' : ''}</span><p>${(role.permissions || []).map((permission) => escapeHTML(PERMISSION_LABELS[permission] || permission)).join('、') || '権限なし'}</p></div>${role.is_system ? '' : `<div class="settings-session-actions"><button type="button" class="settings-session-revoke-button" data-delete-role="${escapeHTML(String(role.id))}">削除</button></div>`}</article>`).join('')}</div><form id="group-role-form" class="group-ui-form"><label>ロール名<input name="name" maxlength="50" required></label><fieldset><legend>権限</legend>${Object.entries(PERMISSION_LABELS).map(([key, label]) => `<label><input type="checkbox" name="permissions" value="${key}"> ${label}</label>`).join('')}</fieldset><div class="settings-save-row"><button type="submit" class="settings-primary-button">ロールを追加</button></div></form>`) }
            ${renderGroupSection('オーナー権限を移譲', `<form id="group-transfer-owner-form" class="group-ui-inline-form"><label>新しいオーナーのNyaitterID<input name="user_id" inputmode="numeric" required></label><button type="submit" class="settings-danger-button">権限を移譲</button></form>`, 'この操作は取り消せません。')}` : ''}
    </main>`;
    bindGroupManageEvents(group);
}

function refreshGroupManage(group) {
    return showGroupDetailScreen(group.id, 'manage');
}

function bindGroupManageEvents(group) {
    document.getElementById('group-profile-form')?.addEventListener('submit', async (event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        try { showLoading(true); await request(groupPath(group.id), { method: 'PATCH', body: { name: form.get('name'), description: form.get('description'), visibility: form.get('visibility') } }); await refreshGroupManage(group); } catch (error) { showAppAlert(error.message || 'プロフィールを更新できませんでした。'); } finally { showLoading(false); }
    });
    document.getElementById('group-invite-form')?.addEventListener('submit', async (event) => {
        event.preventDefault(); const userId = Number(new FormData(event.currentTarget).get('user_id'));
        try { showLoading(true); await request(groupPath(group.id, '/invites'), { method: 'POST', body: { user_id: userId } }); await showAppAlert('招待を送信しました。'); event.currentTarget.reset(); } catch (error) { showAppAlert(error.message || '招待を送信できませんでした。'); } finally { showLoading(false); }
    });
    document.querySelectorAll('[data-join-request]').forEach((button) => button.addEventListener('click', async () => {
        try { showLoading(true); await request(groupPath(group.id, `/join-requests/${encodeURIComponent(button.dataset.joinRequest)}/respond`), { method: 'POST', body: { decision: button.dataset.decision } }); await refreshGroupManage(group); } catch (error) { showAppAlert(error.message || '参加申請を処理できませんでした。'); } finally { showLoading(false); }
    }));
    document.querySelectorAll('[data-member-role]').forEach((select) => select.addEventListener('change', async () => {
        try { showLoading(true); await request(groupPath(group.id, `/members/${encodeURIComponent(select.dataset.memberRole)}`), { method: 'PATCH', body: { role_id: select.value } }); await refreshGroupManage(group); } catch (error) { showAppAlert(error.message || 'ロールを更新できませんでした。'); } finally { showLoading(false); }
    }));
    document.querySelectorAll('[data-ban-member]').forEach((button) => button.addEventListener('click', async () => {
        if (!await showAppConfirm('このユーザーをグループから禁止しますか？')) return;
        try { showLoading(true); await request(groupPath(group.id, `/members/${encodeURIComponent(button.dataset.banMember)}/ban`), { method: 'POST', body: {} }); await refreshGroupManage(group); } catch (error) { showAppAlert(error.message || 'ユーザーを禁止できませんでした。'); } finally { showLoading(false); }
    }));
    document.getElementById('group-role-form')?.addEventListener('submit', async (event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        try { showLoading(true); await request(groupPath(group.id, '/roles'), { method: 'POST', body: { name: form.get('name'), permissions: form.getAll('permissions') } }); await refreshGroupManage(group); } catch (error) { showAppAlert(error.message || 'ロールを追加できませんでした。'); } finally { showLoading(false); }
    });
    document.querySelectorAll('[data-delete-role]').forEach((button) => button.addEventListener('click', async () => {
        if (!await showAppConfirm('このロールを削除しますか？')) return;
        try { showLoading(true); await request(groupPath(group.id, `/roles/${encodeURIComponent(button.dataset.deleteRole)}`), { method: 'DELETE' }); await refreshGroupManage(group); } catch (error) { showAppAlert(error.message || 'ロールを削除できませんでした。'); } finally { showLoading(false); }
    });
    document.getElementById('group-transfer-owner-form')?.addEventListener('submit', async (event) => {
        event.preventDefault(); const userId = Number(new FormData(event.currentTarget).get('user_id'));
        if (!await showAppConfirm('オーナー権限を移譲しますか？この操作は取り消せません。')) return;
        try { showLoading(true); await request(groupPath(group.id, '/transfer-owner'), { method: 'POST', body: { user_id: userId } }); window.location.hash = `#group/${group.id}`; } catch (error) { showAppAlert(error.message || 'オーナー権限を移譲できませんでした。'); } finally { showLoading(false); }
    });
}

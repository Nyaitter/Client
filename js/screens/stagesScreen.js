import { apiRequest } from '../api.js';
import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { getCurrentUser } from '../state.js';
import { escapeHTML, getUserIconUrl } from '../utils/helpers.js';
import { showScreenCompat, getActiveScreenContext } from '../screenManager.js';
import { openCall } from '../modules/calls.js';
import { copyEntityUrl } from '../modules/share.js';
import { openStageManageModal } from '../modules/stageManage.js';
import { createUserInvitePicker } from '../modules/userInvite.js';

async function request(path, options = {}) {
    const { data, error } = await apiRequest(`/server/api/calls${path}`, options);
    if (error) throw error;
    return data;
}

function visibilityLabel(stage) {
    if (stage.visibility === 'group') return 'グループ限定';
    if (stage.visibility === 'private') return '招待した人のみ';
    return '公開';
}

function stageTime(stage) {
    if (stage.status === 'live') return '開催中';
    if (stage.status === 'ended') return '終了';
    return new Date(stage.scheduled_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function inviteBlock(prefix, { submit = false, heading = null, buttonLabel = '招待する', note = '候補を選んでから招待します。' } = {}) {
    return `
        ${heading ? `<h4 id="${prefix}-invite-heading" class="nui-section-title">${escapeHTML(heading)}</h4>` : ''}
        <label for="${prefix}-invite-search">ユーザーIDまたはハンドル</label>
        <input id="${prefix}-invite-search" class="nui-input" type="search" autocomplete="off" placeholder="#1234 または @handle" data-invite-input>
        <div class="user-invite-suggestions" data-invite-suggestions role="listbox" aria-label="ユーザー候補"></div>
        <div class="user-invite-selected" data-invite-selected aria-live="polite"></div>
        <div class="user-invite-actions"><p class="stage-field-help nui-help-text">${escapeHTML(note)}</p>${submit ? `<button class="settings-secondary-button nui-button-secondary" type="submit" data-invite-submit>${escapeHTML(buttonLabel)}</button>` : ''}</div>`;
}

function setupInvitePicker(root, context, { keepSubmitEnabled = false, emptyText } = {}) {
    const submit = root.querySelector('[data-invite-submit]');
    return createUserInvitePicker({
        input: root.querySelector('[data-invite-input]'),
        suggestions: root.querySelector('[data-invite-suggestions]'),
        selected: root.querySelector('[data-invite-selected]'),
        signal: context.signal,
        emptyText,
        onChange: keepSubmitEnabled ? undefined : size => { if (submit) submit.disabled = size === 0; },
    });
}

function createStageDialog(context) {
    const dialog = document.createElement('dialog');
    dialog.className = 'stage-create-dialog nui-modal';
    dialog.setAttribute('aria-labelledby', 'stage-create-title');
    dialog.innerHTML = `
        <header class="stage-dialog-header"><h2 id="stage-create-title" class="nui-modal-title">ステージを作成</h2><button type="button" class="stage-close-button" data-stage-close aria-label="閉じる">×</button></header>
        <form data-stage-create class="group-ui-form stage-create-form nui-form" data-nui="form">
            <div class="stage-dialog-body">
                <section class="stage-form-section nui-section" aria-labelledby="stage-section-basic" data-nui="section">
                    <h3 class="stage-form-section-title nui-section-title" id="stage-section-basic">基本情報</h3>
                    <label for="stage-create-name">ステージ名<input id="stage-create-name" name="name" maxlength="50" placeholder="どんな話をしますか？" required></label>
                    <label for="stage-create-description">説明<textarea id="stage-create-description" name="description" maxlength="2000" rows="3" placeholder="話したいことや参加する人への案内（任意）"></textarea></label>
                </section>
                <section class="stage-form-section nui-section" aria-labelledby="stage-section-visibility" data-nui="section">
                    <h3 class="stage-form-section-title nui-section-title" id="stage-section-visibility">公開範囲</h3>
                    <label for="stage-create-visibility">公開範囲<select id="stage-create-visibility" name="visibility"><option value="public">公開</option><option value="private">招待した人のみ</option><option value="group">グループ</option></select></label>
                    <label for="stage-create-group" data-stage-group-field hidden>対象グループ<select id="stage-create-group" name="group_id"></select><span class="stage-field-help nui-help-text">選択したグループのメンバーだけが閲覧・参加できます。</span></label>
                    <label class="stage-guest-toggle nui-toggle"><span class="stage-guest-toggle-copy">ゲストユーザーの参加を許可<span class="stage-field-help nui-help-text">ゲストは視聴のみで、コメントやスピーカーへの昇格はできません。</span></span><input type="checkbox" name="allow_guest_join"><span class="settings-toggle-track" aria-hidden="true"></span></label>
                </section>
                <section class="stage-form-section nui-section" aria-labelledby="stage-section-schedule" data-nui="section">
                    <h3 class="stage-form-section-title nui-section-title" id="stage-section-schedule">開始</h3>
                    <label for="stage-create-scheduled">開始日時<input id="stage-create-scheduled" name="scheduled_at" type="datetime-local"><span class="stage-field-help nui-help-text">未指定ならすぐに開始します。</span></label>
                </section>
                <details class="stage-form-options">
                    <summary class="stage-form-section-title nui-section-title">参加者を招待</summary>
                    <div class="user-invite-form" data-stage-invite>${inviteBlock('create')}</div>
                </details>
            </div>
            <div class="stage-dialog-footer">
                <p class="stage-feedback" data-stage-create-error role="alert"></p>
                <div class="stage-dialog-actions"><button type="button" class="settings-secondary-button nui-button-secondary" data-stage-close>キャンセル</button><button type="submit" class="settings-primary-button nui-button" data-nui="button" data-stage-submit>開始する</button></div>
            </div>
        </form>`;
    document.body.append(dialog);
    context.addCleanup(() => dialog.remove());
    for (const button of dialog.querySelectorAll('[data-stage-close]')) button.onclick = () => dialog.close();
    const form = dialog.querySelector('form');
    const inviteForm = form.querySelector('[data-stage-invite]');
    const invitePicker = setupInvitePicker(inviteForm, context);
    const groupField = form.querySelector('[data-stage-group-field]');
    const groupSelect = form.elements.group_id;
    let groupsLoaded = false;
    const loadGroups = async () => {
        if (groupsLoaded) return;
        groupsLoaded = true;
        groupSelect.innerHTML = '<option value="">読み込み中…</option>';
        try {
            const { data, error } = await apiRequest('/server/api/groups/mine?limit=200', { signal: context.signal });
            if (error) throw error;
            const groups = Array.isArray(data?.groups) ? data.groups : [];
            groupSelect.innerHTML = groups.length
                ? groups.map(group => `<option value="${escapeHTML(String(group.id))}">${escapeHTML(group.name || 'グループ')}</option>`).join('')
                : '<option value="">参加中のグループがありません</option>';
        } catch {
            if (!context.signal.aborted) groupSelect.innerHTML = '<option value="">読み込みに失敗しました</option>';
        }
    };
    const syncVisibility = () => {
        const isGroup = form.elements.visibility.value === 'group';
        groupField.hidden = !isGroup;
        if (isGroup) void loadGroups();
    };
    form.elements.visibility.onchange = syncVisibility;
    syncVisibility();
    form.elements.scheduled_at.oninput = () => { form.querySelector('[data-stage-submit]').textContent = form.elements.scheduled_at.value ? '予約する' : '開始する'; };
    form.onsubmit = async event => {
        event.preventDefault();
        const button = form.querySelector('[data-stage-submit]');
        const feedback = form.querySelector('[data-stage-create-error]');
        feedback.textContent = '';
        if (form.elements.visibility.value === 'group' && !groupSelect.value) {
            feedback.textContent = '対象のグループを選択してください。';
            return;
        }
        button.disabled = true;
        try {
            const date = form.elements.scheduled_at.value;
            const data = await request('/stages', { method: 'POST', body: {
                name: form.elements.name.value, description: form.elements.description.value,
                visibility: form.elements.visibility.value,
                group_id: form.elements.visibility.value === 'group' ? groupSelect.value : null,
                scheduled_at: date ? new Date(date).toISOString() : null,
                allow_guest_join: form.elements.allow_guest_join.checked,
                invite_ids: invitePicker.ids,
            } });
            if (!context.signal.aborted) { dialog.close(); window.location.hash = `#stage/${data.stage.id}`; }
        } catch (error) { if (!context.signal.aborted) feedback.textContent = error.message; }
        finally { button.disabled = false; }
    };
    return dialog;
}

export async function showStagesScreen(stageId, showScreenFn) {
    showScreenCompat('stages-screen', showScreenFn);
    const context = getActiveScreenContext();
    const container = document.getElementById('stages-content');
    DOM.pageHeader.innerHTML = stageId
        ? `<div class="header-with-back-button"><a href="#stages" class="header-back-btn" aria-label="ステージ一覧へ">${ICONS.back}</a><h2 id="page-title">ステージ</h2></div>`
        : `<div class="header-with-action-button"><h2 id="page-title">ステージ</h2>${getCurrentUser() ? '<button type="button" class="header-action-btn" data-nui-feature="stageCreate" data-stage-open-create>作成</button>' : ''}</div>`;
    container.innerHTML = '<div class="stage-loading"><div class="spinner" aria-label="読み込み中"></div></div>';
    try {
        if (stageId) await showDetail(stageId, container, context);
        else await showList(container, context);
    } catch (error) {
        if (!context.signal.aborted) container.innerHTML = `<div class="stage-empty nui-empty-text"><p role="alert">${escapeHTML(error.message)}</p><a href="#stages" class="settings-secondary-button nui-button-secondary stage-back-link">ステージ一覧へ</a></div>`;
    }
}

async function showList(container, context) {
    container.innerHTML = `
        <main class="nui-page stage-ui-page" data-nui="page">
        <div class="stage-tabs nui-tabs" role="tablist" aria-label="ステージの表示">
            <button type="button" class="tab-button nui-tab active" data-stage-filter="all" aria-pressed="true">すべて</button>
            <button type="button" class="tab-button nui-tab" data-stage-filter="live" aria-pressed="false">開催中</button>
            <button type="button" class="tab-button nui-tab" data-stage-filter="scheduled" aria-pressed="false">予約</button>
        </div>
        <form data-stage-search class="stage-search nui-toolbar"><div class="header-search-bar">${ICONS.explore}<input type="search" name="query" aria-label="ステージを検索" placeholder="ステージを検索"></div><button class="settings-secondary-button nui-button-secondary" type="submit">検索</button></form>
        <p data-stage-error class="stage-feedback" role="status" aria-live="polite"></p>
        <div data-stage-list class="stage-list nui-list"></div>
        <div class="stage-list-footer"><button type="button" class="settings-secondary-button nui-button-secondary" data-stage-more hidden>さらに表示</button></div>
        </main>`;
    const dialog = getCurrentUser() ? createStageDialog(context) : null;
    DOM.pageHeader.querySelector('[data-stage-open-create]')?.addEventListener('click', () => dialog?.showModal());
    let offset = 0;
    let searchGeneration = 0;
    let filter = 'all';
    const stages = new Map();
    const list = container.querySelector('[data-stage-list]');
    const more = container.querySelector('[data-stage-more]');
    function renderList() {
        const visible = [...stages.values()].filter(stage => filter === 'all' || stage.status === filter);
        list.innerHTML = visible.length ? visible.map(stage => `
            <article class="stage-list-item nui-list-item" data-nui="list-item"><a href="#stage/${encodeURIComponent(stage.id)}" class="stage-list-link nui-list-link">
                <div class="stage-list-copy nui-list-copy"><div class="stage-list-meta"><span class="${stage.status === 'live' ? 'stage-live-label' : ''}">${escapeHTML(stageTime(stage))}</span><span class="nui-badge">${escapeHTML(visibilityLabel(stage))}</span>${stage.allow_guest_join ? '<span class="nui-badge nui-badge-accent">ゲスト参加可</span>' : ''}</div>
                    <h3 class="nui-list-title">${escapeHTML(stage.name)}</h3>${stage.description ? `<p class="nui-list-meta">${escapeHTML(stage.description)}</p>` : ''}</div>
                <span class="stage-list-arrow nui-icon" aria-hidden="true">›</span>
            </a></article>`).join('') : `<div class="stage-empty nui-empty-text"><h3>${filter === 'live' ? '開催中のステージはありません' : filter === 'scheduled' ? '予約されたステージはありません' : 'ステージはまだありません'}</h3></div>`;
    }
    async function search(append = false) {
        const version = ++searchGeneration;
        if (!append) { offset = 0; stages.clear(); }
        const query = container.querySelector('[name="query"]').value;
        more.disabled = true;
        container.querySelector('[data-stage-error]').textContent = '';
        try {
            const data = await request(`/stages?${new URLSearchParams({ query, offset })}`, { signal: context.signal });
            if (context.signal.aborted || version !== searchGeneration) return;
            for (const stage of data.stages) stages.set(stage.id, stage);
            renderList();
            more.hidden = !data.has_more;
            offset += 100;
        } catch (error) { if (!context.signal.aborted) container.querySelector('[data-stage-error]').textContent = error.message; }
        finally { more.disabled = false; }
    }
    for (const button of container.querySelectorAll('[data-stage-filter]')) button.onclick = () => {
        filter = button.dataset.stageFilter;
        for (const tab of container.querySelectorAll('[data-stage-filter]')) { tab.classList.toggle('active', tab === button); tab.setAttribute('aria-pressed', String(tab === button)); }
        renderList();
    };
    container.querySelector('[data-stage-search]').addEventListener('submit', event => { event.preventDefault(); void search(); }, { signal: context.signal });
    more.addEventListener('click', () => { void search(true); }, { signal: context.signal });
    await search();
}

async function showDetail(id, container, context) {
    const data = await request(`/stages/${encodeURIComponent(id)}`, { signal: context.signal });
    if (context.signal.aborted) return;
    const stage = data.stage;
    const isHost = stage.owner_id === Number(getCurrentUser()?.id);
    container.innerHTML = `<div class="nui-page stage-ui-page stage-detail">
        <section class="stage-detail-main nui-card" data-nui="card"><div class="stage-list-meta"><span class="${stage.status === 'live' ? 'stage-live-label' : ''}">${escapeHTML(stageTime(stage))}</span><span class="nui-badge">${escapeHTML(visibilityLabel(stage))}</span>${stage.allow_guest_join ? '<span class="nui-badge nui-badge-accent">ゲスト参加可</span>' : ''}</div>
            <h3>${escapeHTML(stage.name)}</h3>${stage.description ? `<p class="stage-description">${escapeHTML(stage.description)}</p>` : ''}
            <a class="stage-host-link" href="#profile/${stage.owner_id}"><span class="stage-host-avatar" aria-hidden="true"><img src="${escapeHTML(getUserIconUrl({ id: stage.owner_id }))}" alt=""></span><span><strong>${escapeHTML(data.host?.name || 'ホスト')}</strong><small>ホスト</small></span></a>
            <div class="stage-join-row"><button type="button" class="settings-primary-button nui-button" data-nui="button" data-stage-join ${stage.status === 'ended' ? 'disabled' : ''}>${stage.status === 'ended' ? '終了しました' : stage.status === 'scheduled' && data.role === 'audience' ? '開始を待つ' : stage.status === 'scheduled' ? 'ステージを開く' : '参加する'}</button><button type="button" class="settings-secondary-button nui-button-secondary" data-stage-share title="共有URLをコピー">${ICONS.share}<span>共有</span></button><span class="nui-badge">${data.guest ? 'ゲスト' : data.role === 'host' ? 'ホスト' : data.role === 'speaker' ? 'スピーカー' : 'リスナー'}</span></div>
            <p data-stage-error class="stage-feedback" role="status" aria-live="polite"></p>
        </section>
        ${isHost && stage.status !== 'ended' ? `<section class="stage-host-section"><button type="button" class="stage-manage-open" data-stage-manage-open>${ICONS.sliders}<span>ステージを管理</span></button></section>` : ''}
    </div>`;
    const report = error => { if (!context.signal.aborted) container.querySelector('[data-stage-error]').textContent = error.message; };
    container.querySelector('[data-stage-join]').onclick = () => { void openCall('stage', id).catch(report); };
    const shareButton = container.querySelector('[data-stage-share]');
    if (shareButton) shareButton.onclick = () => {
        void copyEntityUrl('stage', id, shareButton).catch(error => {
            if (!context.signal.aborted) container.querySelector('[data-stage-error]').textContent = error.message || '共有URLをコピーできませんでした。';
        });
    };
    const manageButton = container.querySelector('[data-stage-manage-open]');
    if (manageButton) manageButton.onclick = () => {
        void openStageManageModal(id, {
            onUpdated: () => { if (!context.signal.aborted) void showDetail(id, container, context); },
        });
    };
}

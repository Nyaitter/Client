import { api, apiRequest } from '../api.js';
import { ICONS } from '../icons.js';
import { escapeHTML, showAppConfirm } from '../utils/helpers.js';
import { createUserInvitePicker } from './userInvite.js';

async function request(path, options = {}) {
    const { data, error } = await apiRequest(`/server/api/calls${path}`, options);
    if (error) throw error;
    return data;
}

const inviteFields = (prefix, { buttonLabel = '招待する', note = '候補を選んでから招待します。' } = {}) => `
    <label for="${prefix}-search">ユーザーIDまたはハンドル</label>
    <input id="${prefix}-search" class="nui-input" type="search" autocomplete="off" placeholder="#1234 または @handle" data-invite-input>
    <div class="user-invite-suggestions" data-invite-suggestions role="listbox" aria-label="ユーザー候補"></div>
    <div class="user-invite-selected" data-invite-selected aria-live="polite"></div>
    <div class="user-invite-actions"><p class="stage-field-help nui-help-text">${escapeHTML(note)}</p><button class="settings-secondary-button nui-button-secondary" type="submit" data-invite-submit>${escapeHTML(buttonLabel)}</button></div>`;

function stageManageMarkup(stage) {
    return `<section class="stage-manage-section">
        <h3 class="stage-manage-heading">${ICONS.activity}<span>ステージの状態</span></h3>
        <div class="stage-manage-row"><p>${stage.status === 'live' ? '開催中' : stage.status === 'ended' ? '終了' : '開始前'}</p>${stage.status === 'scheduled' ? '<button type="button" class="settings-primary-button nui-button" data-stage-status="live">開始する</button>' : ''}</div>
    </section>
    <label class="stage-guest-toggle"><span class="stage-guest-toggle-copy">ゲストユーザーの参加を許可<span class="stage-field-help nui-help-text">ゲストは視聴のみで、コメントやスピーカーへの昇格はできません。</span></span><input type="checkbox" data-stage-guest-toggle ${stage.allow_guest_join ? 'checked' : ''}><span class="settings-toggle-track" aria-hidden="true"></span></label>
    <form class="stage-manage-section user-invite-form" data-stage-manage-invite>
        <h3 class="stage-manage-heading">${ICONS.mention}<span>参加者を招待</span></h3>
        ${inviteFields('stage-manage-invite')}
    </form>
    <form class="stage-manage-section user-invite-form" data-stage-manage-speakers>
        <h3 class="stage-manage-heading">${ICONS.microphone}<span>スピーカー</span></h3>
        ${inviteFields('stage-manage-speaker', { buttonLabel: '発言権を更新', note: '一覧から外した人はリスナーになります。' })}
    </form>
    <section class="stage-manage-section">
        <h3 class="stage-manage-heading">${ICONS.phoneEnd}<span>ステージを終了</span></h3>
        <div class="stage-manage-row"><p>参加者全員が退出します。</p><button type="button" class="settings-secondary-button nui-button-secondary stage-end-button" data-stage-status="ended">終了する</button></div>
    </section>
    <p data-stage-manage-error class="stage-feedback" role="status"></p>`;
}

function bindStageManage(root, stage, stageId, { signal, onUpdated } = {}) {
    const report = error => {
        if (signal?.aborted) return;
        const target = root.querySelector('[data-stage-manage-error]');
        if (target) target.textContent = error.message;
    };
    const update = async payload => {
        await request(`/stages/${encodeURIComponent(stageId)}`, { method: 'PATCH', body: payload, signal });
        if (!signal?.aborted) await onUpdated?.();
    };
    for (const button of root.querySelectorAll('[data-stage-status]')) button.onclick = async () => {
        if (button.dataset.stageStatus === 'ended' && !await showAppConfirm('ステージを終了しますか？ 参加者全員が退出します。')) return;
        button.disabled = true;
        try { await update({ status: button.dataset.stageStatus }); }
        catch (error) { report(error); button.disabled = false; }
    };
    const guestToggle = root.querySelector('[data-stage-guest-toggle]');
    if (guestToggle) guestToggle.onchange = async () => {
        guestToggle.disabled = true;
        try { await update({ allow_guest_join: guestToggle.checked }); }
        catch (error) { guestToggle.checked = !guestToggle.checked; report(error); guestToggle.disabled = false; }
    };
    const inviteForm = root.querySelector('[data-stage-manage-invite]');
    if (inviteForm) {
        const submit = inviteForm.querySelector('[data-invite-submit]');
        const picker = createUserInvitePicker({
            input: inviteForm.querySelector('[data-invite-input]'),
            suggestions: inviteForm.querySelector('[data-invite-suggestions]'),
            selected: inviteForm.querySelector('[data-invite-selected]'),
            signal,
            onChange: size => { if (submit) submit.disabled = size === 0; },
        });
        if (submit) submit.disabled = true;
        inviteForm.onsubmit = async event => {
            event.preventDefault();
            if (!picker.size) return;
            if (submit) submit.disabled = true;
            try { await update({ invite_ids: picker.ids }); }
            catch (error) { report(error); if (submit) submit.disabled = false; }
        };
    }
    const speakerForm = root.querySelector('[data-stage-manage-speakers]');
    if (speakerForm) {
        const submit = speakerForm.querySelector('[data-invite-submit]');
        const picker = createUserInvitePicker({
            input: speakerForm.querySelector('[data-invite-input]'),
            suggestions: speakerForm.querySelector('[data-invite-suggestions]'),
            selected: speakerForm.querySelector('[data-invite-selected]'),
            signal,
            emptyText: 'スピーカーにするユーザーを検索してください。',
        });
        const ids = (stage.speaker_ids || []).map(Number);
        if (ids.length) {
            void api.from('user').select('id, name, scid, me, nyaitter_id, icon_data').in('id', ids).signal(signal)
                .then(({ data: users, error }) => {
                    if (signal?.aborted || error) return;
                    for (const user of Array.isArray(users) ? users : []) picker.add(user);
                })
                .catch(() => {});
        }
        speakerForm.onsubmit = async event => {
            event.preventDefault();
            if (submit) submit.disabled = true;
            try { await update({ speaker_ids: picker.ids }); }
            catch (error) { report(error); if (submit) submit.disabled = false; }
        };
    }
}

export async function openStageManageModal(stageId, { onUpdated } = {}) {
    const dialog = document.createElement('dialog');
    dialog.className = 'stage-manage-dialog';
    dialog.setAttribute('aria-labelledby', 'stage-manage-title');
    dialog.innerHTML = `<div class="stage-manage-card">
        <header class="stage-manage-header"><h2 id="stage-manage-title">${ICONS.sliders}<span>ステージを管理</span></h2><button type="button" class="stage-manage-close" aria-label="閉じる">${ICONS.close}</button></header>
        <div class="stage-manage-body" data-stage-manage-body><div class="spinner"></div></div>
    </div>`;
    document.body.append(dialog);
    const controller = new AbortController();
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        controller.abort();
        dialog.close();
        dialog.remove();
    };
    dialog.querySelector('.stage-manage-close').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    const body = dialog.querySelector('[data-stage-manage-body]');
    const render = async () => {
        body.innerHTML = '<div class="spinner"></div>';
        let data;
        try { data = await request(`/stages/${encodeURIComponent(stageId)}`, { signal: controller.signal }); }
        catch (error) {
            if (!controller.signal.aborted) body.innerHTML = `<p class="stage-feedback" role="alert">${escapeHTML(error.message)}</p>`;
            return;
        }
        if (controller.signal.aborted) return;
        body.innerHTML = stageManageMarkup(data.stage);
        bindStageManage(body, data.stage, stageId, {
            signal: controller.signal,
            onUpdated: async () => { onUpdated?.(); await render(); },
        });
    };
    dialog.showModal();
    await render();
    return { close };
}

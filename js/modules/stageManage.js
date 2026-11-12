import { t } from './i18n.js';
import { api, apiRequest } from '../api.js';
import { ICONS } from '../icons.js';
import { escapeHTML, showAppConfirm } from '../utils/helpers.js';
import { createUserInvitePicker } from './userInvite.js';

async function request(path, options = {}) {
    const { data, error } = await apiRequest(`/server/api/calls${path}`, options);
    if (error) throw error;
    return data;
}

const endingStages = new Map();
export function endStage(stageId, { signal } = {}) {
    const id = String(stageId);
    if (endingStages.has(id)) return endingStages.get(id);
    const ending = (async () => {
        if (!await showAppConfirm(t('stagemanage.end_confirm'))) return null;
        if (signal?.aborted) return null;
        return request(`/stages/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'ended' }, signal });
    })();
    endingStages.set(id, ending);
    void ending.finally(() => { if (endingStages.get(id) === ending) endingStages.delete(id); }).catch(() => {});
    return ending;
}

const inviteFields = (prefix, { buttonLabel = t('stage.invite_button_default'), note = t('stage.invite_note_default') } = {}) => `
    <label for="${prefix}-search">${t('stage.invite_id_label')}</label>
    <input id="${prefix}-search" class="nui-input" type="search" autocomplete="off" placeholder="${t('group.invite_id_placeholder')}" data-invite-input>
    <div class="user-invite-suggestions" data-invite-suggestions role="listbox" aria-label="${t('group.invite_suggestions_label')}"></div>
    <div class="user-invite-selected" data-invite-selected aria-live="polite"></div>
    <div class="user-invite-actions"><p class="stage-field-help nui-help-text">${escapeHTML(note)}</p><button class="settings-secondary-button nui-button-secondary" type="submit" data-invite-submit>${escapeHTML(buttonLabel)}</button></div>`;

function stageManageMarkup(stage) {
    return `<section class="stage-manage-section">
        <h3 class="stage-manage-heading">${ICONS.activity}<span>${t('stagemanage.status_heading')}</span></h3>
        <div class="stage-manage-row"><p>${stage.status === 'live' ? t('stage.status_live') : stage.status === 'ended' ? t('post.poll_ended') : t('stagemanage.status_upcoming')}</p>${stage.status === 'scheduled' ? `<button type="button" class="settings-primary-button nui-button" data-stage-status="live">${t('stage.submit_start')}</button>` : ''}</div>
    </section>
    <label class="stage-guest-toggle nui-toggle"><span class="stage-guest-toggle-copy">${t('stage.guest_toggle_label')}<span class="stage-field-help nui-help-text">${t('stage.guest_toggle_help')}</span></span><input type="checkbox" data-stage-guest-toggle ${stage.allow_guest_join ? 'checked' : ''}><span class="settings-toggle-track" aria-hidden="true"></span></label>
    <form class="stage-manage-section user-invite-form" data-stage-manage-invite>
        <h3 class="stage-manage-heading">${ICONS.mention}<span>${t('stage.invite_section')}</span></h3>
        ${inviteFields('stage-manage-invite')}
    </form>
    <form class="stage-manage-section user-invite-form" data-stage-manage-speakers>
        <h3 class="stage-manage-heading">${ICONS.microphone}<span>${t('callview.role_speaker')}</span></h3>
        ${inviteFields('stage-manage-speaker', { buttonLabel: t('stagemanage.speaker_update_button'), note: t('stagemanage.speaker_note') })}
    </form>
    <section class="stage-manage-section">
        <h3 class="stage-manage-heading">${ICONS.phoneEnd}<span>${t('stagemanage.end_heading')}</span></h3>
        <div class="stage-manage-row"><p>${t('stagemanage.end_note')}</p><button type="button" class="settings-secondary-button nui-button-secondary stage-end-button" data-stage-status="ended">${t('stagemanage.end_button')}</button></div>
    </section>
    <p data-stage-manage-error class="stage-feedback" role="status"></p>`;
}

function bindStageManage(root, stage, stageId, { signal, onUpdated } = {}) {
    const report = error => {
        if (signal?.aborted) return;
        const target = root.querySelector('[data-stage-manage-error]');
        if (target) target.textContent = error.message;
    };
    let busy = false;
    const update = async payload => {
        if (busy) throw new Error(t('stagemanage.busy'));
        busy = true;
        try {
            const data = payload.status === 'ended'
                ? await endStage(stageId, { signal })
                : await request(`/stages/${encodeURIComponent(stageId)}`, { method: 'PATCH', body: payload, signal });
            if (!data) return false;
            if (!signal?.aborted) await onUpdated?.(data.stage);
            return true;
        } finally {
            busy = false;
        }
    };
    for (const button of root.querySelectorAll('[data-stage-status]')) button.onclick = async () => {
        if (busy || button.disabled) return;
        button.disabled = true;
        try { if (!await update({ status: button.dataset.stageStatus })) button.disabled = false; }
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
            emptyText: t('stagemanage.speaker_empty'),
        });
        const ids = (stage.speaker_ids || []).map(Number);
        if (submit) submit.disabled = true;
        const finishSpeakerPreload = () => {
            if (!signal?.aborted && submit) submit.disabled = false;
        };
        if (ids.length) {
            void api.from('user').select('id, name, scid, me, nyaitter_id, icon_data').in('id', ids).signal(signal)
                .then(({ data: users, error }) => {
                    if (signal?.aborted) return;
                    if (error) throw error;
                    for (const user of Array.isArray(users) ? users : []) picker.add(user);
                    finishSpeakerPreload();
                })
                .catch(report);
        } else {
            finishSpeakerPreload();
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
        <header class="stage-manage-header">
            <div class="stage-manage-heading">
                <h2 id="stage-manage-title">${ICONS.sliders}<span>${t('stage.manage_button')}</span></h2>
                <p>${t('stagemanage.subtitle')}</p>
            </div>
            <button type="button" class="stage-manage-close" aria-label="${t('common.close')}">${ICONS.close}</button>
        </header>
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
            onUpdated: async stage => {
                onUpdated?.(stage);
                if (stage?.status === 'ended') close();
                else await render();
            },
        });
    };
    dialog.showModal();
    await render();
    return { close };
}

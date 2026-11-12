import { t } from './i18n.js';
import { ICONS } from '../icons.js';
import { rankAvatarAttributes } from './rankAvatarIntegration.js';
import { escapeHTML, formatNyaitterId, getUserIconUrl } from '../utils/helpers.js';

export const roleName = role => ({ host: t('dm.host_badge'), speaker: t('callview.role_speaker'), audience: t('callview.role_audience'), member: t('call.participant_fallback') })[role] || t('call.participant_fallback');
const initial = name => escapeHTML(Array.from(name || '?')[0]);
const avatar = (person, extra = '') => {
    const name = typeof person === 'string' ? person : person?.name;
    const id = person?.id ?? person?.user_id;
    const image = id && !String(id).startsWith('guest:') ? `<img ${rankAvatarAttributes({ ...person, id })} src="${escapeHTML(getUserIconUrl({ ...person, id }))}" alt="" loading="lazy">` : initial(name);
    return `<span class="call-avatar nui-avatar ${extra}" aria-hidden="true">${image}</span>`;
};
const tool = (action, icon, label, attributes = '') => `<button type="button" class="call-tool-button" data-call-action="${action}" title="${label}" aria-label="${label}" ${attributes}>${icon}<span>${label}</span></button>`;
const device = (kind, label, icon, enabled) => `<label class="call-device-toggle" title="${label}"><input type="checkbox" aria-label="${label}" data-call-device="${kind}" ${enabled ? '' : 'disabled'}>${icon}<span class="call-device-label">${label}</span><span class="call-device-state" aria-hidden="true" data-on="${t('callview.device_on')}" data-off="${t('callview.device_off')}"></span></label>`;
const inputSelect = (kind, label) => `<label class="call-device-select"><span>${label}</span><select data-call-input-select="${kind}" aria-label="${t('callview.select_label', { label })}"></select></label>`;
const settingsModal = (canCapture, audience, suffix = '') => `<div class="call-settings-modal" data-call-settings hidden role="dialog" aria-modal="true" aria-labelledby="call-settings-title${suffix}">
    <div class="call-settings-card">
        <header class="call-settings-header"><h3 id="call-settings-title${suffix}">${t('callview.settings_title')}</h3><button type="button" class="call-settings-close" data-call-action="close-settings" aria-label="${t('common.close')}">${ICONS.close}</button></header>
        <div class="call-settings-body">
            <section class="call-settings-section">
                <div class="call-settings-row"><span>${t('callview.quality')}</span><output data-call-quality-value>Middle</output></div>
                <input class="call-quality-range" type="range" min="0" max="2" step="1" value="1" data-call-quality aria-label="${t('callview.quality_label')}">
                <div class="call-quality-ticks" aria-hidden="true"><span>Low</span><span>Middle</span><span>High</span></div>
            </section>
            <section class="call-settings-section" data-call-settings-devices ${audience ? 'hidden' : ''}>
                <h4>${t('callview.devices_heading')}</h4>
                <div class="call-device-controls">${device('audio', t('call.device_microphone'), ICONS.microphone, canCapture)}${device('video', t('call.device_camera'), ICONS.camera, canCapture)}</div>
                <div class="call-device-selectors">${inputSelect('audio', t('call.device_microphone'))}${inputSelect('video', t('call.device_camera'))}</div>
            </section>
        </div>
    </div>
</div>`;
const personTools = (person, isHost, pref = {}, isSelf = false) => `<div class="call-person-tools" popover="manual" role="toolbar" aria-label="${t('callview.person_tools_label', { name: escapeHTML(person.name || t('post.user_fallback')) })}">
    <label class="call-volume-control" title="${t('callview.volume')}"><input type="range" min="0" max="200" value="100" step="5" data-person-volume aria-label="${t('callview.person_volume_label', { name: escapeHTML(person.name || t('post.user_fallback')) })}"></label>
    <button type="button" class="${pref.muted ? 'is-active' : ''}" data-person-action="mute" title="${t('call.pref_mute')}" aria-label="${t('call.pref_mute')}" aria-pressed="${Boolean(pref.muted)}">${ICONS.microphone}${pref.muted ? '<span class="call-slash"></span>' : ''}<span class="call-tool-user">${ICONS.profile}</span></button>
    <button type="button" class="${pref.cameraHidden ? 'is-active' : ''}" data-person-action="camera" title="${t('callview.hide_video')}" aria-label="${t('callview.hide_video')}" aria-pressed="${Boolean(pref.cameraHidden)}">${ICONS.camera}${pref.cameraHidden ? '<span class="call-slash"></span>' : ''}<span class="call-tool-user">${ICONS.profile}</span></button>
    <button type="button" class="${pref.chatHidden ? 'is-active' : ''}" data-person-action="chat" title="${t('callview.hide_chat')}" aria-label="${t('callview.hide_chat')}" aria-pressed="${Boolean(pref.chatHidden)}">${ICONS.dm}${pref.chatHidden ? '<span class="call-slash"></span>' : ''}<span class="call-tool-user">${ICONS.profile}</span></button>
    <button type="button" class="${pref.pinned ? 'is-active' : ''}" data-person-action="pin" title="${t('call.pref_pin')}" aria-label="${t('call.pref_pin')}" aria-pressed="${Boolean(pref.pinned)}">${ICONS.preview}</button>
    <button type="button" class="${pref.hidden ? 'is-active' : ''}" data-person-action="hide" title="${t('call.pref_shelve')}" aria-label="${t('call.pref_shelve')}" aria-pressed="${Boolean(pref.hidden)}">${ICONS.preview}<span class="call-slash"></span></button>
    ${isHost ? `<span class="call-host-tools">${isSelf ? `<button type="button" class="${person.force_pinned ? 'is-active' : ''}" data-host-action="pin" title="${t('call.host_pin')}" aria-label="${t('call.host_pin')}">${ICONS.preview}</button>` : `<button type="button" class="${person.force_muted ? 'is-active' : ''}" data-host-action="mute" title="${t('call.host_mute')}" aria-label="${t('call.host_mute')}">${ICONS.microphone}${person.force_muted ? '<span class="call-slash"></span>' : ''}</button><button type="button" class="${person.force_camera_off ? 'is-active' : ''}" data-host-action="camera" title="${t('call.host_camera_off')}" aria-label="${t('call.host_camera_off')}">${ICONS.camera}${person.force_camera_off ? '<span class="call-slash"></span>' : ''}</button><button type="button" class="${person.chat_disabled ? 'is-active' : ''}" data-host-action="chat" title="${t('call.host_chat_off')}" aria-label="${t('call.host_chat_off')}">${ICONS.dm}${person.chat_disabled ? '<span class="call-slash"></span>' : ''}</button><button type="button" class="${person.force_pinned ? 'is-active' : ''}" data-host-action="pin" title="${t('call.host_pin')}" aria-label="${t('call.host_pin')}">${ICONS.preview}</button>${person.role === 'audience' ? `<button type="button" data-host-action="promote" title="${t('call.host_promote')}" aria-label="${t('call.host_promote')}">${ICONS.microphone}</button>` : person.role === 'speaker' ? `<button type="button" data-host-action="demote" title="${t('call.host_demote')}" aria-label="${t('call.host_demote')}">${ICONS.microphone}<span class="call-slash"></span></button>` : ''}<button type="button" data-host-action="kick" title="${t('call.host_kick')}" aria-label="${t('call.host_kick')}">${ICONS.profile}<span class="call-slash"></span></button>`}</span>` : ''}
  </div>`;

// The call window is a resizable dialog: a maximized window tracks the viewport
// but a floating/resized one does not. Layout density should therefore follow the
// panel's own aspect ratio. A single guarded ResizeObserver (created lazily on the
// first roster render) keeps a `data-aspect` hook in sync; CSS does the adapting.
const aspectObservers = new WeakMap();
const aspectOf = (width, height) => {
    if (!width || !height) return null;
    const ratio = width / height;
    if (ratio >= 1.3) return 'wide';
    if (ratio <= 1) return 'portrait';
    return 'square';
};
function observePanelAspect(panel) {
    const apply = () => {
        const aspect = aspectOf(panel.clientWidth, panel.clientHeight);
        if (aspect) panel.dataset.aspect = aspect;
    };
    apply();
    if (aspectObservers.has(panel) || typeof ResizeObserver === 'undefined') return;
    try {
        const observer = new ResizeObserver(apply);
        observer.observe(panel);
        aspectObservers.set(panel, observer);
    } catch (error) {
        console.error('callView: aspect observer unavailable', error);
    }
}

export function releaseCallView(panel) {
    aspectObservers.get(panel)?.disconnect();
    aspectObservers.delete(panel);
}

export function callMarkup(kind, info, user, canCapture, uid = '') {
    const suffix = uid === '' ? '' : `-${uid}`;
    const isStage = kind === 'stage';
    const audience = info.role === 'audience';
    const waiting = isStage && audience && info.stage?.status === 'scheduled';
    const liveListener = isStage && audience && info.stage?.status === 'live';
    const title = info.stage?.name || info.title || t('call.title_fallback');
    return `
        <header class="call-panel-header">
            <div class="call-window-title">
                <span class="call-window-icon" aria-hidden="true">${isStage ? ICONS.activity : ICONS.phone}</span>
                <div class="call-window-copy">
                    <h2 id="call-title${suffix}">${escapeHTML(title)}</h2>
                    <p class="call-window-meta"><span>${isStage ? t('stage.page_title') : t('call.title_fallback')}</span><span class="call-header-count" data-call-header-count></span></p>
                </div>
            </div>
        </header>
        <div class="call-panel-body">
            <div class="call-media-parking" data-call-media-parking aria-hidden="true" style="position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none"></div>
            ${waiting ? `<section class="call-waiting" data-call-waiting><h3>${t('callview.waiting_title')}</h3><button type="button" class="settings-secondary-button nui-button-secondary" data-call-action="cancel">${t('common.cancel')}</button></section>` : `<div class="call-prejoin" data-call-prejoin ${liveListener ? 'hidden' : ''}>
                <div class="call-prejoin-preview"><div class="call-media-tile call-local-tile" data-local-tile><div class="call-preview-placeholder">${avatar(user, 'call-avatar-large')}</div><video data-local-preview autoplay muted playsinline></video></div></div>
                <div class="call-prejoin-devices">
                    <div class="call-device-controls" data-call-device-controls ${audience ? 'hidden' : ''}>${device('audio', t('call.device_microphone'), ICONS.microphone, canCapture)}${device('video', t('call.device_camera'), ICONS.camera, canCapture)}</div>
                    <div class="call-device-selectors" data-call-prejoin-selectors ${audience ? 'hidden' : ''}>${inputSelect('audio', t('call.device_microphone'))}${inputSelect('video', t('call.device_camera'))}</div>
                </div>
                <div class="call-prejoin-actions"><button type="button" class="settings-primary-button nui-button" data-call-action="join">${t('group.join_button')}</button><button type="button" class="settings-secondary-button nui-button-secondary" data-call-action="cancel">${t('common.cancel')}</button><button type="button" class="call-prejoin-settings" data-call-action="settings" title="${t('nav.settings')}" aria-label="${t('callview.settings_title')}">${ICONS.settings}<span>${t('nav.settings')}</span></button></div>
            </div>`}
            <div class="call-room" data-kind="${kind}" data-call-in-session hidden>
                <div class="call-stage-area"><section class="call-participants"><ul class="nui-list" data-call-roster></ul></section><div class="call-bottom-rail" data-empty="true"><section class="call-secondary-participants"><ul class="nui-list" data-call-secondary></ul></section>${isStage ? '<section class="call-listeners" data-call-listeners hidden></section>' : ''}</div></div>
                <section class="call-chat" aria-labelledby="call-chat-title${suffix}"><header><h3 id="call-chat-title${suffix}">${isStage ? t('call.action_comment') : t('call.action_chat')}</h3><button type="button" class="call-chat-close" data-call-action="chat" aria-label="${isStage ? t('callview.close_comments') : t('callview.close_chat')}">${ICONS.close}</button></header><div data-call-messages role="log" aria-live="polite" data-empty-text="${t('callview.chat_empty')}"></div>
                    <form data-call-chat><label class="sr-only" for="call-message-input${suffix}">${isStage ? t('call.action_comment') : t('callview.message_label')}</label><input id="call-message-input${suffix}" name="message" maxlength="2000" placeholder="${isStage ? t('callview.comment_placeholder') : t('callview.message_placeholder')}" required disabled><button class="call-send-button" aria-label="${t('common.send')}" disabled>${ICONS.send}</button></form>
                </section>
            </div>
        </div>
        <footer class="call-panel-footer" data-call-in-session hidden><div class="call-footer-devices" data-call-device-target></div><div class="call-tools" data-call-publisher-tools hidden>${tool('share', ICONS.screenShare, t('callview.share_screen_label'), 'aria-pressed="false" hidden')}</div><div class="call-footer-actions">${tool('transcribe', ICONS.captions, t('call.action_transcribe_show'), 'aria-pressed="false"')}${tool('play', ICONS.phone, t('callview.tool_play_audio'), 'hidden')}${tool('chat', ICONS.dm, isStage ? t('call.action_comment') : t('call.action_chat'), 'aria-pressed="true"')}<button type="button" class="call-leave-button" data-call-action="leave" title="${t('callview.leave')}">${ICONS.phoneEnd}<span>${t('callview.leave')}</span></button>${isStage && info.role === 'host' && !info.guest ? `<button type="button" class="call-leave-button call-end-stage-button" data-call-action="end-stage" title="${t('callview.end_stage')}" aria-label="${t('callview.end_stage')}">${ICONS.phoneEnd}<span>${t('callview.end_stage')}</span></button>` : ''}</div><div class="call-footer-utility">${isStage && info.role === 'host' ? tool('manage-stage', ICONS.sliders, t('callview.manage_stage')) : ''}${tool('settings', ICONS.settings, t('nav.settings'))}</div></footer>
        ${settingsModal(canCapture, audience, suffix)}`;
}

export function renderParticipants(panel, roster, kind, userId, screenShares = new Map(), isHost = false, preferences = {}) {
    observePanelAspect(panel);
    const speakers = kind === 'stage' ? roster.filter(person => person.role !== 'audience') : [...roster];
    if (kind === 'stage') speakers.push(...roster.filter(person => person.role === 'audience' && (preferences[String(person.user_id)]?.pinned || preferences[String(person.user_id)]?.hidden || person.force_pinned)));
    for (const [screenUserId, share] of screenShares) {
        const owner = roster.find(person => String(person.user_id) === String(screenUserId));
        if (owner) speakers.push({ ...owner, user_id: `screen:${screenUserId}`, owner_user_id: owner.user_id, role: 'speaker', muted: true, camera: true, isScreen: true, screen_label: share.label, name: owner.name });
    }
    const listeners = kind === 'stage' ? roster.filter(person => person.role === 'audience' && !preferences[String(person.user_id)]?.pinned && !preferences[String(person.user_id)]?.hidden && !person.force_pinned) : [];
    const bottomRail = panel.querySelector('.call-bottom-rail');
    panel.querySelector('[data-call-header-count]').textContent = t('callview.count_people', { count: roster.length });
    const prefs = preferences;
    const pinned = speakers.filter(person => (prefs[String(person.user_id)]?.pinned || person.force_pinned) && !prefs[String(person.user_id)]?.hidden);
    const mainSpeakers = pinned.length ? pinned : speakers.filter(person => !prefs[String(person.user_id)]?.hidden);
    const secondary = speakers.filter(person => !mainSpeakers.includes(person));
    bottomRail.dataset.empty = String(secondary.length === 0 && listeners.length === 0);
    const stageArea = panel.querySelector('.call-stage-area');
    if (stageArea) stageArea.dataset.speakersEmpty = String(mainSpeakers.length === 0);
    const card = person => {
        const ownerId = person.owner_user_id ?? person.user_id;
        const panelId = String(person.user_id);
        const displayHandle = person.guest ? person.name : `@${person.name || t('call.participant_fallback')}${person.isScreen ? t('callview.screen_suffix') : ''}`;
        const displayId = formatNyaitterId({ nyaitter_id: person.nyaitter_id || ownerId });
        const showId = !person.guest;
        const title = `${displayHandle}${showId ? displayId : ''}`;
        const remoteVideo = person.role !== 'audience' ? `<div class="call-person-video" data-person-video="${escapeHTML(panelId)}"></div>` : '';
        const pref = preferences[panelId] || {};
        const chatHidden = preferences[String(ownerId)]?.chatHidden || false;
        const self = String(ownerId) === String(userId);
        const personAvatar = avatar({ ...person, user_id: ownerId });
        return `<li class="call-person nui-list-item${person.isScreen ? ' call-person-screen' : ''}" data-nui="list-item" data-user-id="${escapeHTML(String(ownerId))}" data-panel-id="${escapeHTML(panelId)}" data-muted="${Boolean(person.muted)}" data-hidden-by-me="${Boolean(pref.hidden)}" data-pinned="${Boolean(pref.pinned)}" data-person-camera-hidden="${Boolean(pref.cameraHidden)}" data-person-chat-hidden="${Boolean(chatHidden)}" data-transcript-user="${escapeHTML(panelId)}"><span class="call-person-avatar">${personAvatar}</span>${remoteVideo}<div class="call-person-caption"><div class="call-transcript-box" data-transcript-box hidden></div><span class="call-person-name" title="${escapeHTML(title)}">${escapeHTML(displayHandle)}${showId ? `<span class="call-person-id">${escapeHTML(displayId)}</span>` : ''}</span><span class="call-person-mic" aria-label="${person.isScreen ? t('callview.share_screen_label') : person.muted ? t('callview.mic_muted') : t('callview.mic_on')}" title="${person.isScreen ? t('callview.share_screen_label') : person.muted ? t('callview.mic_muted') : t('callview.mic_on')}">${person.isScreen ? ICONS.screenShare : ICONS.microphone}</span></div>${personTools(person, isHost, { ...pref, chatHidden }, String(ownerId) === String(userId))}</li>`;
    };
    // Live <video> hosts (local preview tile, remote camera/screen tiles) must not be
    // detached from the document: removing a media element from the DOM queues an
    // internal pause, and a detached element stops producing frames (videoWidth stays 0),
    // which permanently hides the tile. Park them in a persistent in-document container
    // while the roster markup is rebuilt; callers immediately re-place them afterwards.
    const parking = panel.querySelector('[data-call-media-parking]');
    if (parking) {
        for (const media of panel.querySelectorAll('[data-call-roster] .call-local-tile, [data-call-roster] .call-person-camera, [data-call-secondary] .call-local-tile, [data-call-secondary] .call-person-camera')) {
            if (media.parentElement !== parking) parking.append(media);
        }
    }
    panel.querySelector('[data-call-roster]').innerHTML = mainSpeakers.map(card).join('');
    panel.querySelector('[data-call-secondary]').innerHTML = secondary.map(card).join('');
    bottomRail.classList.toggle('has-secondary', secondary.length > 0);
    const audience = panel.querySelector('[data-call-listeners]');
    if (audience) {
        audience.hidden = !listeners.length;
        audience.innerHTML = `<h3>${t('callview.role_audience')} <span class="nui-badge">${listeners.length}</span></h3><ul class="nui-list">${listeners.map(person => {
            const handle = person.guest ? person.name : `@${person.name || t('call.participant_fallback')}`;
            const id = formatNyaitterId({ nyaitter_id: person.nyaitter_id || person.user_id });
            const pref = preferences[String(person.user_id)] || {};
            return `<li class="nui-list-item" data-nui="list-item" data-user-id="${escapeHTML(String(person.user_id))}" data-hidden-by-me="${Boolean(pref.hidden)}" data-pinned="${Boolean(pref.pinned)}">${avatar(person)}<span class="call-listener-caption"><span class="call-listener-name" title="${escapeHTML(`${handle}${person.guest ? '' : id}`)}">${escapeHTML(handle)}${person.guest ? '' : `<span class="call-listener-id">${escapeHTML(id)}</span>`}</span></span>${personTools(person, isHost, pref, String(person.user_id) === String(userId))}</li>`;
        }).join('')}</ul>`;
    }
}

import { ICONS } from '../icons.js';
import { escapeHTML, formatNyaitterId, getUserIconUrl } from '../utils/helpers.js';

export const roleName = role => ({ host: 'ホスト', speaker: 'スピーカー', audience: 'リスナー', member: '参加者' })[role] || '参加者';
const initial = name => escapeHTML(Array.from(name || '?')[0]);
const avatar = (person, extra = '') => {
    const name = typeof person === 'string' ? person : person?.name;
    const id = person?.id ?? person?.user_id;
    const image = id && !String(id).startsWith('guest:') ? `<img src="${escapeHTML(getUserIconUrl({ ...person, id }))}" alt="" loading="lazy">` : initial(name);
    return `<span class="call-avatar nui-avatar ${extra}" aria-hidden="true">${image}</span>`;
};
const tool = (action, icon, label, attributes = '') => `<button type="button" class="call-tool-button" data-call-action="${action}" title="${label}" aria-label="${label}" ${attributes}>${icon}<span>${label}</span></button>`;
const device = (kind, label, icon, enabled) => `<label class="call-device-toggle" title="${label}"><input type="checkbox" aria-label="${label}" data-call-device="${kind}" ${enabled ? '' : 'disabled'}>${icon}<span class="call-device-label">${label}</span><span class="call-device-state" aria-hidden="true"></span></label>`;
const inputSelect = (kind, label) => `<label class="call-device-select"><span>${label}</span><select data-call-input-select="${kind}" aria-label="${label}を選択"></select></label>`;
const settingsModal = (canCapture, audience, suffix = '') => `<div class="call-settings-modal" data-call-settings hidden role="dialog" aria-modal="true" aria-labelledby="call-settings-title${suffix}">
    <div class="call-settings-card">
        <header class="call-settings-header"><h3 id="call-settings-title${suffix}">通話の設定</h3><button type="button" class="call-settings-close" data-call-action="close-settings" aria-label="閉じる">${ICONS.close}</button></header>
        <div class="call-settings-body">
            <section class="call-settings-section">
                <div class="call-settings-row"><span>品質</span><output data-call-quality-value>Middle</output></div>
                <input class="call-quality-range" type="range" min="0" max="2" step="1" value="1" data-call-quality aria-label="通話の品質">
                <div class="call-quality-ticks" aria-hidden="true"><span>Low</span><span>Middle</span><span>High</span></div>
            </section>
            <section class="call-settings-section" data-call-settings-devices ${audience ? 'hidden' : ''}>
                <h4>マイク・カメラ</h4>
                <div class="call-device-controls">${device('audio', 'マイク', ICONS.microphone, canCapture)}${device('video', 'カメラ', ICONS.camera, canCapture)}</div>
                <div class="call-device-selectors">${inputSelect('audio', 'マイク')}${inputSelect('video', 'カメラ')}</div>
            </section>
        </div>
    </div>
</div>`;
const personTools = (person, isHost, pref = {}, isSelf = false) => `<div class="call-person-tools" popover="manual" role="toolbar" aria-label="${escapeHTML(person.name || 'ユーザー')}の操作">
    <label class="call-volume-control" title="音量"><input type="range" min="0" max="200" value="100" step="5" data-person-volume aria-label="${escapeHTML(person.name || 'ユーザー')}の音量"></label>
    <button type="button" class="${pref.muted ? 'is-active' : ''}" data-person-action="mute" title="自分だけミュート" aria-label="自分だけミュート" aria-pressed="${Boolean(pref.muted)}">${ICONS.microphone}${pref.muted ? '<span class="call-slash"></span>' : ''}<span class="call-tool-user">${ICONS.profile}</span></button>
    <button type="button" class="${pref.cameraHidden ? 'is-active' : ''}" data-person-action="camera" title="映像を非表示" aria-label="映像を非表示" aria-pressed="${Boolean(pref.cameraHidden)}">${ICONS.camera}${pref.cameraHidden ? '<span class="call-slash"></span>' : ''}<span class="call-tool-user">${ICONS.profile}</span></button>
    <button type="button" class="${pref.chatHidden ? 'is-active' : ''}" data-person-action="chat" title="チャットを非表示" aria-label="チャットを非表示" aria-pressed="${Boolean(pref.chatHidden)}">${ICONS.dm}${pref.chatHidden ? '<span class="call-slash"></span>' : ''}<span class="call-tool-user">${ICONS.profile}</span></button>
    <button type="button" class="${pref.pinned ? 'is-active' : ''}" data-person-action="pin" title="固定表示" aria-label="固定表示" aria-pressed="${Boolean(pref.pinned)}">${ICONS.preview}</button>
    <button type="button" class="${pref.hidden ? 'is-active' : ''}" data-person-action="hide" title="退避" aria-label="退避" aria-pressed="${Boolean(pref.hidden)}">${ICONS.preview}<span class="call-slash"></span></button>
    ${isHost ? `<span class="call-host-tools">${isSelf ? `<button type="button" class="${person.force_pinned ? 'is-active' : ''}" data-host-action="pin" title="パネルを強制固定" aria-label="パネルを強制固定">${ICONS.preview}</button>` : `<button type="button" class="${person.force_muted ? 'is-active' : ''}" data-host-action="mute" title="マイクを強制ミュート" aria-label="マイクを強制ミュート">${ICONS.microphone}${person.force_muted ? '<span class="call-slash"></span>' : ''}</button><button type="button" class="${person.force_camera_off ? 'is-active' : ''}" data-host-action="camera" title="カメラを強制オフ" aria-label="カメラを強制オフ">${ICONS.camera}${person.force_camera_off ? '<span class="call-slash"></span>' : ''}</button><button type="button" class="${person.chat_disabled ? 'is-active' : ''}" data-host-action="chat" title="チャットを強制オフ" aria-label="チャットを強制オフ">${ICONS.dm}${person.chat_disabled ? '<span class="call-slash"></span>' : ''}</button><button type="button" class="${person.force_pinned ? 'is-active' : ''}" data-host-action="pin" title="パネルを強制固定" aria-label="パネルを強制固定">${ICONS.preview}</button>${person.role === 'audience' ? `<button type="button" data-host-action="promote" title="スピーカーに昇格" aria-label="スピーカーに昇格">${ICONS.microphone}</button>` : person.role === 'speaker' ? `<button type="button" data-host-action="demote" title="リスナーに降格" aria-label="リスナーに降格">${ICONS.microphone}<span class="call-slash"></span></button>` : ''}<button type="button" data-host-action="kick" title="セッションから追放" aria-label="セッションから追放">${ICONS.profile}<span class="call-slash"></span></button>`}</span>` : ''}
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

export function callMarkup(kind, info, user, canCapture, uid = '') {
    const suffix = uid === '' ? '' : `-${uid}`;
    const isStage = kind === 'stage';
    const audience = info.role === 'audience';
    const waiting = isStage && audience && info.stage?.status === 'scheduled';
    const liveListener = isStage && audience && info.stage?.status === 'live';
    const title = info.stage?.name || info.title || '通話';
    return `
        <header class="call-panel-header"><div class="call-window-title"><span class="call-kind nui-badge">${isStage ? 'ステージ' : '通話'}</span><h2 id="call-title${suffix}">${escapeHTML(title)}</h2><span class="call-header-count nui-badge" data-call-header-count></span></div></header>
        <div class="call-panel-body">
            <div class="call-media-parking" data-call-media-parking aria-hidden="true" style="position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none"></div>
            ${waiting ? `<section class="call-waiting" data-call-waiting><h3>開始を待っています</h3><button type="button" class="settings-secondary-button nui-button-secondary" data-call-action="cancel">キャンセル</button></section>` : `<div class="call-prejoin" data-call-prejoin ${liveListener ? 'hidden' : ''}>
                <div class="call-prejoin-preview"><div class="call-media-tile call-local-tile" data-local-tile><div class="call-preview-placeholder">${avatar(user, 'call-avatar-large')}</div><video data-local-preview autoplay muted playsinline></video></div></div>
                <div class="call-prejoin-devices">
                    <div class="call-device-controls" data-call-device-controls ${audience ? 'hidden' : ''}>${device('audio', 'マイク', ICONS.microphone, canCapture)}${device('video', 'カメラ', ICONS.camera, canCapture)}</div>
                    <div class="call-device-selectors" data-call-prejoin-selectors ${audience ? 'hidden' : ''}>${inputSelect('audio', 'マイク')}${inputSelect('video', 'カメラ')}</div>
                </div>
                <div class="call-prejoin-actions"><button type="button" class="settings-primary-button nui-button" data-call-action="join">参加する</button><button type="button" class="settings-secondary-button nui-button-secondary" data-call-action="cancel">キャンセル</button><button type="button" class="call-prejoin-settings" data-call-action="settings" title="設定" aria-label="通話の設定">${ICONS.settings}<span>設定</span></button></div>
            </div>`}
            <div class="call-room" data-kind="${kind}" data-call-in-session hidden>
                <div class="call-stage-area"><section class="call-participants"><ul class="nui-list" data-call-roster></ul></section><div class="call-bottom-rail" data-empty="true"><section class="call-secondary-participants"><ul class="nui-list" data-call-secondary></ul></section>${isStage ? '<section class="call-listeners" data-call-listeners hidden></section>' : ''}</div></div>
                <section class="call-chat" aria-labelledby="call-chat-title${suffix}"><header><h3 id="call-chat-title${suffix}">${isStage ? 'コメント' : 'チャット'}</h3><button type="button" class="call-chat-close" data-call-action="chat" aria-label="${isStage ? 'コメントを閉じる' : 'チャットを閉じる'}">${ICONS.close}</button></header><div data-call-messages role="log" aria-live="polite"></div>
                    <form data-call-chat><label class="sr-only" for="call-message-input${suffix}">${isStage ? 'コメント' : 'メッセージ'}</label><input id="call-message-input${suffix}" name="message" maxlength="2000" placeholder="${isStage ? 'コメントする' : 'メッセージを送る'}" required disabled><button class="call-send-button" aria-label="送信" disabled>${ICONS.send}</button></form>
                </section>
            </div>
        </div>
        <footer class="call-panel-footer" data-call-in-session hidden><div class="call-footer-devices" data-call-device-target></div><div class="call-tools" data-call-publisher-tools hidden>${tool('share', ICONS.screenShare, '画面共有', 'aria-pressed="false" hidden')}</div><div class="call-footer-actions">${tool('transcribe', ICONS.captions, '文字起こしを表示', 'aria-pressed="false"')}${tool('play', ICONS.phone, '音声を再生', 'hidden')}${tool('chat', ICONS.dm, isStage ? 'コメント' : 'チャット', 'aria-pressed="true"')}<button type="button" class="call-leave-button" data-call-action="leave" title="退出">${ICONS.phoneEnd}<span>退出</span></button></div><div class="call-footer-utility">${isStage && info.role === 'host' ? tool('manage-stage', ICONS.sliders, 'ステージ管理') : ''}${tool('settings', ICONS.settings, '設定')}</div></footer>
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
    panel.querySelector('[data-call-header-count]').textContent = `${roster.length}人`;
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
        const displayHandle = person.guest ? person.name : `@${person.name || '参加者'}${person.isScreen ? 'のスクリーン' : ''}`;
        const displayId = formatNyaitterId({ nyaitter_id: person.nyaitter_id || ownerId });
        const showId = !person.guest;
        const title = `${displayHandle}${showId ? displayId : ''}`;
        const remoteVideo = person.role !== 'audience' ? `<div class="call-person-video" data-person-video="${escapeHTML(panelId)}"></div>` : '';
        const pref = preferences[panelId] || {};
        const chatHidden = preferences[String(ownerId)]?.chatHidden || false;
        const self = String(ownerId) === String(userId);
        const personAvatar = avatar({ ...person, user_id: ownerId });
        return `<li class="call-person nui-list-item${person.isScreen ? ' call-person-screen' : ''}" data-nui="list-item" data-user-id="${escapeHTML(String(ownerId))}" data-panel-id="${escapeHTML(panelId)}" data-muted="${Boolean(person.muted)}" data-hidden-by-me="${Boolean(pref.hidden)}" data-pinned="${Boolean(pref.pinned)}" data-person-camera-hidden="${Boolean(pref.cameraHidden)}" data-person-chat-hidden="${Boolean(chatHidden)}" data-transcript-user="${escapeHTML(panelId)}"><span class="call-person-avatar">${personAvatar}</span>${remoteVideo}<div class="call-person-caption"><div class="call-transcript-box" data-transcript-box hidden></div><span class="call-person-name" title="${escapeHTML(title)}">${escapeHTML(displayHandle)}${showId ? `<span class="call-person-id">${escapeHTML(displayId)}</span>` : ''}</span><span class="call-person-mic" aria-label="${person.isScreen ? '画面共有' : person.muted ? 'ミュート' : 'マイクオン'}" title="${person.isScreen ? '画面共有' : person.muted ? 'ミュート' : 'マイクオン'}">${person.isScreen ? ICONS.screenShare : ICONS.microphone}</span></div>${personTools(person, isHost, { ...pref, chatHidden }, String(ownerId) === String(userId))}</li>`;
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
        audience.innerHTML = `<h3>リスナー <span class="nui-badge">${listeners.length}</span></h3><ul class="nui-list">${listeners.map(person => {
            const handle = person.guest ? person.name : `@${person.name || '参加者'}`;
            const id = formatNyaitterId({ nyaitter_id: person.nyaitter_id || person.user_id });
            const pref = preferences[String(person.user_id)] || {};
            return `<li class="nui-list-item" data-nui="list-item" data-user-id="${escapeHTML(String(person.user_id))}" data-hidden-by-me="${Boolean(pref.hidden)}" data-pinned="${Boolean(pref.pinned)}">${avatar(person)}<span class="call-listener-caption"><span class="call-listener-name" title="${escapeHTML(`${handle}${person.guest ? '' : id}`)}">${escapeHTML(handle)}${person.guest ? '' : `<span class="call-listener-id">${escapeHTML(id)}</span>`}</span></span>${personTools(person, isHost, pref, String(person.user_id) === String(userId))}</li>`;
        }).join('')}</ul>`;
    }
}

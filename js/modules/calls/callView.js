import { ICONS } from '../../icons.js';
import { escapeHTML, formatNyaitterId, getUserIconUrl } from '../../utils/helpers.js';

export const roleName = role => ({
    host: 'ホスト',
    speaker: 'スピーカー',
    audience: 'リスナー',
    member: '参加者',
})[role] || '参加者';

const initial = name => escapeHTML(Array.from(name || '?')[0] || '?');
const icon = name => ICONS[name] || '';

function avatar(person, className = '') {
    const name = typeof person === 'string' ? person : person?.name;
    const id = person?.id ?? person?.user_id ?? person?.owner_user_id;
    const image = id && !String(id).startsWith('guest:')
        ? `<img src="${escapeHTML(getUserIconUrl({ ...person, id }))}" alt="" loading="lazy">`
        : initial(name);
    return `<span class="call-avatar nui-avatar ${className}" aria-hidden="true">${image}</span>`;
}

function tool(action, iconName, label, pressed = null) {
    return `<button type="button" class="call-tool nui-button-secondary" data-call-action="${action}" title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}"${pressed === null ? '' : ` aria-pressed="${Boolean(pressed)}"`}>${icon(iconName)}<span class="call-tool-label">${escapeHTML(label)}</span></button>`;
}

function deviceSelect(kind, label) {
    return `<label class="call-device-field nui-field"><span>${escapeHTML(label)}</span><select class="nui-input" data-call-device-select="${kind}" aria-label="${escapeHTML(label)}を選択"><option value="">既定</option></select></label>`;
}

export function renderCallShell({ kind, info, user, canPublish, guest = false }) {
    const isStage = kind === 'stage';
    const title = info.stage?.name || info.title || (isStage ? 'ステージ' : '通話');
    const backHash = isStage ? `#stage/${encodeURIComponent(info.stage?.id || info.id || '')}` : `#dm/${encodeURIComponent(info.id || '')}`;
    const audience = info.role === 'audience';
    const waiting = isStage && audience && info.stage?.status === 'scheduled';
    return `
        <section class="call-view nui-page" data-call-view data-kind="${kind}" data-chat-open="true">
            <header class="call-header">
                <a class="call-back nui-button-secondary" href="${escapeHTML(backHash)}" aria-label="戻る" title="戻る">${icon('back')}</a>
                <div class="call-heading">
                    <h1 class="call-title nui-page-heading">${escapeHTML(title)}</h1>
                    <p class="call-meta"><span class="call-kind nui-badge">${isStage ? 'ステージ' : '通話'}</span><span data-call-status role="status" aria-live="polite">準備中</span><span data-call-count></span></p>
                </div>
                <div class="call-header-actions">
                    ${isStage && info.role === 'host' ? tool('manage-stage', 'sliders', 'ステージ管理') : ''}
                    ${tool('settings', 'settings', '設定')}
                </div>
            </header>

            <div class="call-layout">
                <main class="call-main">
                    <section class="call-prejoin nui-card" data-call-prejoin ${waiting ? 'hidden' : ''}>
                        <div class="call-preview" data-call-preview>
                            <video data-local-preview autoplay muted playsinline></video>
                            <div class="call-preview-empty" data-local-placeholder>${avatar(user, 'call-avatar-large')}</div>
                            <span class="call-preview-badge" data-local-badge hidden>カメラオフ</span>
                        </div>
                        <div class="call-prejoin-body">
                            <div>
                                <h2 class="call-prejoin-title">${canPublish ? '参加の準備' : 'ステージに参加'}</h2>
                                <p class="call-prejoin-note nui-help-text">${guest ? 'ゲストは視聴のみできます。' : canPublish ? 'マイクとカメラを確認してから参加してください。' : '開始までこの画面で待機します。'}</p>
                            </div>
                            <div class="call-devices" ${canPublish ? '' : 'hidden'}>
                                <div class="call-device-buttons">
                                    <button type="button" class="call-device-button" data-call-action="toggle-audio" aria-pressed="false">${icon('microphone')}<span>マイク</span></button>
                                    <button type="button" class="call-device-button" data-call-action="toggle-video" aria-pressed="false">${icon('camera')}<span>カメラ</span></button>
                                </div>
                                <div class="call-device-selects">${deviceSelect('audio', 'マイク')}${deviceSelect('video', 'カメラ')}</div>
                            </div>
                            <p class="call-feedback" data-call-feedback role="alert"></p>
                            <div class="call-prejoin-actions">
                                <button type="button" class="call-join-button nui-button" data-call-action="join" ${info.stage?.status === 'ended' ? 'disabled' : ''}>${info.stage?.status === 'ended' ? '終了しました' : waiting ? '開始を待つ' : '参加する'}</button>
                                <a class="nui-button-secondary" href="${escapeHTML(backHash)}">キャンセル</a>
                            </div>
                        </div>
                    </section>

                    <section class="call-waiting nui-empty-text" data-call-waiting ${waiting ? '' : 'hidden'}>
                        <div class="call-waiting-icon">${icon(isStage ? 'activity' : 'phone')}</div>
                        <h2>開始を待っています</h2>
                        <p>ホストがステージを開始すると自動で参加します。</p>
                        <a class="nui-button-secondary" href="${escapeHTML(backHash)}">キャンセル</a>
                    </section>

                    <div class="call-room" data-call-room hidden>
                        <ul class="call-roster" data-call-roster aria-label="参加者"></ul>
                        <section class="call-listeners" data-call-listeners hidden>
                            <h2 class="nui-section-title">リスナー <span class="nui-badge" data-call-listener-count>0</span></h2>
                            <ul class="call-listener-list" data-call-listener-list></ul>
                        </section>
                    </div>
                </main>

                <aside class="call-chat nui-card" data-call-chat aria-label="${isStage ? 'コメント' : 'チャット'}">
                    <header class="call-chat-header">
                        <h2 class="nui-section-title">${isStage ? 'コメント' : 'チャット'}</h2>
                        <button type="button" class="call-icon-button" data-call-action="toggle-chat" aria-label="チャットを閉じる" title="閉じる">${icon('close')}</button>
                    </header>
                    <div class="call-messages" data-call-messages role="log" aria-live="polite"></div>
                    <form class="call-chat-form" data-call-chat-form>
                        <label class="sr-only" for="call-message-input">${isStage ? 'コメント' : 'メッセージ'}</label>
                        <input class="nui-input" id="call-message-input" name="message" maxlength="2000" autocomplete="off" placeholder="${isStage ? 'コメントする' : 'メッセージを送る'}" required>
                        <button class="call-send-button nui-button" aria-label="送信" title="送信">${icon('send')}</button>
                    </form>
                </aside>
            </div>

            <footer class="call-controlbar" data-call-controls hidden>
                <button type="button" class="call-control" data-call-action="toggle-audio" aria-pressed="false" title="マイク" ${canPublish ? '' : 'hidden'}>${icon('microphone')}<span>マイク</span></button>
                <button type="button" class="call-control" data-call-action="toggle-video" aria-pressed="false" title="カメラ" ${canPublish ? '' : 'hidden'}>${icon('camera')}<span>カメラ</span></button>
                <button type="button" class="call-control" data-call-action="share" aria-pressed="false" title="画面共有" ${canPublish ? '' : 'hidden'}>${icon('screenShare')}<span>共有</span></button>
                <button type="button" class="call-control" data-call-action="transcribe" aria-pressed="false" title="文字起こし">${icon('captions')}<span>文字起こし</span></button>
                <button type="button" class="call-control" data-call-action="toggle-chat" aria-pressed="true" title="チャット">${icon('dm')}<span>${isStage ? 'コメント' : 'チャット'}</span></button>
                <button type="button" class="call-control call-play" data-call-action="play" hidden title="音声を再生">${icon('phone')}<span>音声</span></button>
                <button type="button" class="call-leave" data-call-action="leave" title="退出">${icon('phoneEnd')}<span>退出</span></button>
            </footer>

            <div class="call-menu" data-call-menu-box hidden role="menu"></div>
            <div class="call-media-parking" data-call-media-parking aria-hidden="true"></div>

            <dialog class="call-settings nui-modal" data-call-settings aria-labelledby="call-settings-title">
                <header class="call-settings-header">
                    <h2 id="call-settings-title" class="nui-modal-title">通話の設定</h2>
                    <button type="button" class="call-icon-button" data-call-action="close-settings" aria-label="閉じる">${icon('close')}</button>
                </header>
                <div class="call-settings-body">
                    <section class="nui-section">
                        <div class="call-settings-row"><span>画質</span><output data-call-quality-value>中</output></div>
                        <input class="call-quality" type="range" min="0" max="2" step="1" value="1" data-call-quality aria-label="画質">
                        <div class="call-quality-ticks" aria-hidden="true"><span>低</span><span>中</span><span>高</span></div>
                    </section>
                    <section class="nui-section" data-call-settings-devices ${canPublish ? '' : 'hidden'}>
                        <h3 class="nui-section-title">マイク・カメラ</h3>
                        <div class="call-device-selects">${deviceSelect('audio', 'マイク')}${deviceSelect('video', 'カメラ')}</div>
                    </section>
                </div>
            </dialog>
        </section>`;
}

export function collectView(root) {
    return {
        root,
        status: root.querySelector('[data-call-status]'),
        count: root.querySelector('[data-call-count]'),
        prejoin: root.querySelector('[data-call-prejoin]'),
        preview: root.querySelector('[data-call-preview]'),
        localVideo: root.querySelector('[data-local-preview]'),
        localPlaceholder: root.querySelector('[data-local-placeholder]'),
        localBadge: root.querySelector('[data-local-badge]'),
        feedback: root.querySelector('[data-call-feedback]'),
        waiting: root.querySelector('[data-call-waiting]'),
        room: root.querySelector('[data-call-room]'),
        roster: root.querySelector('[data-call-roster]'),
        listeners: root.querySelector('[data-call-listeners]'),
        listenerList: root.querySelector('[data-call-listener-list]'),
        listenerCount: root.querySelector('[data-call-listener-count]'),
        chat: root.querySelector('[data-call-chat]'),
        messages: root.querySelector('[data-call-messages]'),
        chatForm: root.querySelector('[data-call-chat-form]'),
        controls: root.querySelector('[data-call-controls]'),
        settings: root.querySelector('[data-call-settings]'),
        quality: root.querySelector('[data-call-quality]'),
        qualityValue: root.querySelector('[data-call-quality-value]'),
        menu: root.querySelector('[data-call-menu-box]'),
        parking: root.querySelector('[data-call-media-parking]'),
    };
}

function personLabel(person) {
    const name = person.guest ? person.name : `@${String(person.name || '参加者').replace(/^@/, '')}${person.isScreen ? 'の画面' : ''}`;
    const id = person.isScreen || person.guest ? '' : formatNyaitterId({ nyaitter_id: person.nyaitter_id || person.owner_user_id || person.user_id });
    return { name, id };
}

function tileMarkup(person, session, preferences) {
    const panelId = String(person.user_id);
    const ownerId = String(person.owner_user_id ?? person.user_id);
    const pref = preferences[ownerId] || {};
    const { name, id } = personLabel(person);
    const self = ownerId === String(session.localUserId);
    const screen = Boolean(person.isScreen);
    const menu = session.joined ? `<button type="button" class="call-tile-more" data-call-menu="${escapeHTML(panelId)}" aria-label="参加者の操作" title="操作">${icon('more')}</button>` : '';
    return `<li class="call-tile${screen ? ' call-tile-screen' : ''}" data-user-id="${escapeHTML(ownerId)}" data-panel-id="${escapeHTML(panelId)}" data-screen="${screen}" data-muted="${Boolean(person.muted)}" data-camera="${Boolean(person.camera)}" data-camera-hidden="${Boolean(pref.cameraHidden)}" data-pinned="${Boolean(pref.pinned)}" data-hidden="${Boolean(pref.hidden)}">
        <div class="call-tile-media" data-media-slot="${escapeHTML(panelId)}"></div>
        <div class="call-tile-avatar" data-tile-avatar>${avatar({ ...person, user_id: ownerId })}</div>
        <div class="call-tile-transcript" data-transcript="${escapeHTML(panelId)}" hidden></div>
        <div class="call-tile-caption"><span class="call-tile-name" title="${escapeHTML(`${name}${id}`)}">${escapeHTML(name)}${id ? `<span class="call-tile-id">${escapeHTML(id)}</span>` : ''}</span><span class="call-tile-state" title="${person.muted ? 'ミュート' : 'マイクオン'}">${screen ? icon('screenShare') : icon('microphone')}</span></div>
        ${menu}
    </li>`;
}

export function renderRoster(view, session) {
    if (!view?.roster || !session?.joined) return;
    for (const media of view.root.querySelectorAll('[data-media-slot] > *')) {
        if (media.parentElement !== view.parking) view.parking.append(media);
    }
    const speakers = session.kind === 'stage'
        ? session.roster.filter(person => person.role !== 'audience')
        : [...session.roster];
    if (session.kind === 'stage') {
        speakers.push(...session.roster.filter(person => person.role === 'audience'
            && (session.preferences[String(person.user_id)]?.pinned || session.preferences[String(person.user_id)]?.hidden || person.force_pinned)));
    }
    for (const [screenUserId, share] of session.screenShares) {
        const owner = session.roster.find(person => String(person.user_id) === String(screenUserId));
        if (!owner) continue;
        speakers.push({ ...owner, user_id: `screen:${screenUserId}`, owner_user_id: owner.user_id, role: 'speaker', muted: true, camera: true, isScreen: true, screen_label: share.label });
    }
    const listeners = session.kind === 'stage'
        ? session.roster.filter(person => person.role === 'audience'
            && !session.preferences[String(person.user_id)]?.pinned
            && !session.preferences[String(person.user_id)]?.hidden
            && !person.force_pinned)
        : [];
    const pinned = speakers.filter(person => (session.preferences[String(person.user_id)]?.pinned || person.force_pinned)
        && !session.preferences[String(person.user_id)]?.hidden);
    const main = pinned.length ? pinned : speakers.filter(person => !session.preferences[String(person.user_id)]?.hidden);
    view.roster.innerHTML = main.map(person => tileMarkup(person, session, session.preferences)).join('');
    view.roster.dataset.count = String(main.length);
    view.root.querySelectorAll('[data-call-count]').forEach(node => { node.textContent = `${session.roster.length}人`; });
    if (view.listeners) {
        view.listeners.hidden = listeners.length === 0;
        if (view.listenerCount) view.listenerCount.textContent = String(listeners.length);
        view.listenerList.innerHTML = listeners.map(person => {
            const { name, id } = personLabel(person);
            return `<li class="call-listener" data-user-id="${escapeHTML(String(person.user_id))}" data-camera-hidden="${Boolean(session.preferences[String(person.user_id)]?.cameraHidden)}">${avatar(person)}<span class="call-listener-name" title="${escapeHTML(`${name}${id}`)}">${escapeHTML(name)}${id ? `<span class="call-tile-id">${escapeHTML(id)}</span>` : ''}</span></li>`;
        }).join('');
    }
}

export function placeMedia(view, session, mediaStreams) {
    if (!view || !session) return;
    for (const remote of mediaStreams.values()) {
        const { stream, userId, screen } = remote;
        const panelId = screen ? `screen:${userId}` : String(userId);
        const slot = view.roster.querySelector(`[data-media-slot="${CSS.escape(panelId)}"]`);
        const tile = slot?.closest('.call-tile');
        if (!slot) continue;
        if (remote.element.parentElement !== slot) slot.append(remote.element);
        const video = remote.video;
        const active = screen
            ? Boolean(video.videoWidth && video.videoHeight)
            : session.roster.find(person => String(person.user_id) === String(userId))?.camera === true
                && !session.preferences[String(userId)]?.cameraHidden
                && Boolean(video.videoWidth && video.videoHeight)
                && stream.getVideoTracks().some(track => track.readyState === 'live' && !track.muted);
        remote.element.dataset.video = String(Boolean(active));
        tile?.classList.toggle('has-video', Boolean(active));
    }
    const selfId = String(session.localUserId);
    const selfTile = view.roster.querySelector(`.call-tile[data-panel-id="${CSS.escape(selfId)}"]`);
    if (selfTile && view.localVideo) {
        const slot = selfTile.querySelector('[data-media-slot]');
        if (slot && view.localVideo.parentElement !== slot) slot.append(view.localVideo);
        const hasVideo = Boolean(session.media?.videoEnabled && view.localVideo.videoWidth && view.localVideo.videoHeight);
        view.localVideo.dataset.video = String(hasVideo);
        selfTile.classList.toggle('has-video', hasVideo);
        if (view.localBadge) view.localBadge.hidden = Boolean(hasVideo) || !session.media;
    }
    if (session.media?.screen) {
        const panelId = `screen:${selfId}`;
        const tile = view.roster.querySelector(`.call-tile[data-panel-id="${CSS.escape(panelId)}"]`);
        if (tile) {
            const slot = tile.querySelector('[data-media-slot]');
            if (session.screenPreview && slot && session.screenPreview.parentElement !== slot) slot.append(session.screenPreview);
            tile.classList.add('has-video');
        }
    }
}

export function appendChat(view, event) {
    if (!view?.messages) return;
    view.messages.querySelector('.call-chat-empty')?.remove();
    const line = document.createElement('div');
    line.className = 'call-message';
    line.dataset.userId = String(event.user_id);
    const name = String(event.name || '参加者');
    line.innerHTML = `<span class="call-message-avatar nui-avatar" aria-hidden="true">${event.user_id && !String(event.user_id).startsWith('guest:')
        ? `<img src="${escapeHTML(getUserIconUrl({ id: event.user_id }))}" alt="" loading="lazy">`
        : initial(name)}</span><div class="call-message-content"><div class="call-message-author"><strong>${escapeHTML(name)}</strong>${event.guest ? '' : `<span>${escapeHTML(formatNyaitterId({ nyaitter_id: event.nyaitter_id || event.user_id }))}</span>`}</div><p>${escapeHTML(String(event.text || ''))}</p></div>`;
    view.messages.append(line);
    while (view.messages.childElementCount > 300) view.messages.firstElementChild.remove();
    view.messages.scrollTop = view.messages.scrollHeight;
}

export function renderTranscripts(view, session) {
    if (!view || !session) return;
    for (const box of view.roster.querySelectorAll('[data-transcript]')) {
        const text = session.transcriptByUser.get(box.dataset.transcript);
        box.hidden = !session.transcriptionEnabled || !text;
        box.textContent = text || '';
        box.scrollTop = box.scrollHeight;
    }
}

export function setStatus(view, text) {
    if (view?.status) view.status.textContent = text || '';
}

export function setFeedback(view, text) {
    if (view?.feedback) view.feedback.textContent = text || '';
}

export function syncDeviceControls(view, media) {
    if (!view) return;
    const audioOn = Boolean(media?.audioEnabled);
    const videoOn = Boolean(media?.videoEnabled);
    for (const button of view.root.querySelectorAll('[data-call-action="toggle-audio"]')) {
        button.setAttribute('aria-pressed', String(audioOn));
        button.classList.toggle('is-active', audioOn);
    }
    for (const button of view.root.querySelectorAll('[data-call-action="toggle-video"]')) {
        button.setAttribute('aria-pressed', String(videoOn));
        button.classList.toggle('is-active', videoOn);
    }
    if (view.localBadge) view.localBadge.hidden = videoOn;
}

export async function populateDeviceSelects(view, media, selected = {}) {
    if (!view) return;
    const devices = await media.listDevices();
    for (const kind of ['audio', 'video']) {
        const list = devices.filter(item => item.kind === (kind === 'audio' ? 'audioinput' : 'videoinput'));
        for (const select of view.root.querySelectorAll(`[data-call-device-select="${kind}"]`)) {
            const value = selected[kind] || select.value || '';
            select.innerHTML = `<option value="">既定</option>${list.map((item, index) => `<option value="${escapeHTML(item.deviceId)}">${escapeHTML(item.label || `${kind === 'audio' ? 'マイク' : 'カメラ'} ${index + 1}`)}</option>`).join('')}`;
            select.value = list.some(item => item.deviceId === value) ? value : '';
        }
    }
}

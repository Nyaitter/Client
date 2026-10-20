import { callMarkup, renderParticipants } from './callView.js';
import { AppWindow } from './appWindow.js';
import { apiRequest } from '../api.js';
import { getCurrentUser, getRealtimeChannel } from '../state.js';
import { escapeHTML, formatNyaitterId, getUserIconUrl, showAppAlert } from '../utils/helpers.js';
import { connectGuestRealtime, stopGuestRealtime } from './realtime.js';
import { openStageManageModal } from './stageManage.js';

// 複数の通話/ステージへ同時参加できるよう、状態はルームキー単位の record で持つ。
// record = { key, session, panel, window, pending, activePersonTools, personToolsCloseTimer }
// session は通話1件分のメディア/ロスター状態、panel は対応する dialog。
const calls = new Map();
const openingKeys = new Set();
let requestSequence = 0;
let panelSequence = 0;
const captureSupported = () => typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof globalThis.MediaStream === 'function';
const rtcSupported = () => typeof globalThis.RTCPeerConnection === 'function';
const localTracks = (current, kind) => (current?.local?.getTracks() || []).filter(track => !kind || track.kind === kind);
const keyFor = (kind, id) => `${kind}:${id}`;

// --- WebRTC 送受信の品質・帯域・遅延チューニング -------------------------------
// カメラは動き優先、画面共有は解像度（文字）優先で符号化する。contentHint を
// 取得時にトラックへ付け、送信パラメータ側で maxBitrate 等を決める目印にする。
const isScreenTrack = track => track?.kind === 'video' && (track.contentHint === 'detail' || track.contentHint === 'text');
const QUALITY_PROFILES = {
    low: { label: 'Low', audio: 32000, video: 500000, screen: 1000000, framerate: 20 },
    middle: { label: 'Middle', audio: 64000, video: 1500000, screen: 2500000, framerate: 30 },
    high: { label: 'High', audio: 96000, video: 3000000, screen: 4000000, framerate: 30 },
};
const qualityProfile = current => QUALITY_PROFILES[current?.quality] || QUALITY_PROFILES.middle;
function tuneSender(sender, current, videoBitrateCap = Infinity) {
    const track = sender?.track;
    if (!track || typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') return;
    try {
        const params = sender.getParameters();
        if (!Array.isArray(params.encodings) || !params.encodings.length) params.encodings = [{}];
        const encoding = params.encodings[0];
        const profile = qualityProfile(current);
        if (track.kind === 'audio') {
            encoding.maxBitrate = profile.audio;
            encoding.networkPriority = 'high';
            encoding.priority = 'high';
        } else {
            const screen = isScreenTrack(track);
            const profileBitrate = screen ? profile.screen : profile.video;
            encoding.maxBitrate = Math.max(120000, Math.min(profileBitrate, videoBitrateCap));
            encoding.maxFramerate = screen
                ? Math.min(profile.framerate, 15)
                : videoBitrateCap < 500000 ? Math.min(profile.framerate, 15) : profile.framerate;
            encoding.networkPriority = 'high';
            encoding.priority = 'high';
            params.degradationPreference = screen ? 'maintain-resolution' : 'balanced';
        }
        // 交渉前は encodings が空で setParameters が失敗しうるため握りつぶす。
        // 交渉後に再適用することで確実に反映される。
        const result = sender.setParameters(params);
        if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (_) { /* 未対応ブラウザでは既定パラメータのまま動かす。 */ }
}
function tunePeerSenders(peer, current) {
    for (const sender of peer?.pc?.getSenders?.() || []) {
        tuneSender(sender, current, peer.videoBitrateCap ?? Infinity);
    }
}

async function adaptPeerSenders(peer, current) {
    if (peer.closed || peer.statsInFlight || peer.pc.connectionState !== 'connected' || !peer.pc.getStats) return;
    peer.statsInFlight = true;
    try {
        const stats = await peer.pc.getStats();
        if (peer.closed || peer.current !== current) return;
        peer.statsErrorLogged = false;
        let availableBitrate = Infinity;
        let packetLoss = 0;
        let roundTripTime = 0;
        for (const report of stats.values()) {
            if (report.type === 'candidate-pair'
                && (report.selected || (report.nominated && report.state === 'succeeded'))
                && Number.isFinite(report.availableOutgoingBitrate)) {
                availableBitrate = Math.min(availableBitrate, report.availableOutgoingBitrate);
            }
            if (report.type === 'remote-inbound-rtp') {
                packetLoss = Math.max(packetLoss, Number(report.fractionLost) || 0);
                roundTripTime = Math.max(roundTripTime, Number(report.roundTripTime) || 0);
            }
        }
        const videoSenderCount = (peer.pc.getSenders() || [])
            .filter(sender => sender.track?.kind === 'video').length;
        const connectedVideoPeers = [...current.peers.values()].filter(candidate =>
            candidate.pc.connectionState === 'connected'
            && candidate.pc.getSenders().some(sender => sender.track?.kind === 'video'),
        ).length;
        let nextCap = Infinity;
        if (videoSenderCount && Number.isFinite(availableBitrate)) {
            nextCap = Math.max(
                120000,
                availableBitrate * 0.75 / videoSenderCount / Math.max(1, connectedVideoPeers),
            );
        }
        if (packetLoss >= 0.1) nextCap *= 0.7;
        else if (packetLoss >= 0.04) nextCap *= 0.85;
        if (roundTripTime >= 0.5) nextCap *= 0.75;
        else if (roundTripTime >= 0.3) nextCap *= 0.9;

        const previousCap = peer.videoBitrateCap ?? Infinity;
        if (Number.isFinite(nextCap) !== Number.isFinite(previousCap)
            || (Number.isFinite(nextCap) && Math.abs(nextCap - previousCap) / Math.max(previousCap, 1) >= 0.15)) {
            peer.videoBitrateCap = nextCap;
            tunePeerSenders(peer, current);
        }
    } catch (error) {
        if (!peer.closed && peer.current === current && !peer.statsErrorLogged) {
            console.warn('[calls] media adaptation stats unavailable:', error);
            peer.statsErrorLogged = true;
        }
    } finally {
        peer.statsInFlight = false;
    }
}

function videoCaptureConstraints(deviceId = '') {
    return {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
    };
}

async function request(path, options) {
    const { data, error } = await apiRequest(path, options);
    if (error) throw error;
    return data;
}

function send(record, type, data = {}) {
    const socket = getRealtimeChannel();
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('接続が切れました。再接続してください。');
    socket.send(JSON.stringify({ type, kind: record.session?.kind, id: record.session?.id, ...data }));
}

function status(message) {
    if (message) console.log(message);
}

// Keep a live media node inside the document (but hidden) instead of detaching it.
// A detached <video> is paused and stops decoding, so videoWidth collapses to 0 and
// readiness checks can never turn back on.
function parkMedia(record, node) {
    const parking = record.panel?.querySelector('[data-call-media-parking]');
    if (parking && node && node.parentElement !== parking) parking.append(node);
}

function rerenderRoster(record) {
    const session = record.session;
    const panel = record.panel;
    if (!session || !panel) return;
    renderParticipants(panel, session.roster, session.kind, session.localUserId, session.screenShares, session.role === 'host', session.preferences);
    placeLocalTiles(record);
    applyPersonPreferences(record);
    // Per-person camera-hide is a presentation-only preference (CSS via
    // data-person-camera-hidden). Keep the media node attached so it keeps decoding
    // instead of removing it, otherwise unhiding would show a black/dead tile.
    for (const remote of session.streams.values()) {
        placeVideoInCard(record, remote, session);
        remote.refreshVideo?.();
    }
    renderTranscripts(record);
}

function applyPersonPreferences(record) {
    const session = record.session;
    const panel = record.panel;
    if (!session || !panel) return;
    for (const [id, pref] of Object.entries(session.preferences || {})) {
        for (const video of panel.querySelectorAll(`.call-person[data-panel-id="${CSS.escape(id)}"] video`)) {
            if (!video.matches('[data-local-preview]')) {
                video.muted = Boolean(pref.muted);
                video.volume = Number.isFinite(pref.volume) ? pref.volume : 1;
            }
        }
        for (const card of panel.querySelectorAll(`.call-person[data-panel-id="${CSS.escape(id)}"]`)) {
            card.dataset.personCameraHidden = String(Boolean(pref.cameraHidden));
        }
        const slider = panel.querySelector(`.call-person[data-panel-id="${CSS.escape(id)}"] [data-person-volume]`);
        if (slider) slider.value = String(Math.round((pref.volume ?? 1) * 100));
    }
    for (const card of panel.querySelectorAll('.call-person[data-user-id]')) card.dataset.personChatHidden = String(Boolean(session.preferences[String(card.dataset.userId)]?.chatHidden));
    for (const message of panel.querySelectorAll('.call-message[data-user-id]')) message.hidden = Boolean(session.preferences[String(message.dataset.userId)]?.chatHidden);
}

function showContextMenu(record, x, y, panelId, userId = panelId) {
    const session = record.session;
    document.querySelector('.call-context-menu')?.remove();
    const menu = document.createElement('div'); menu.className = 'call-context-menu'; menu.setAttribute('role', 'menu');
    const prefs = { ...(session.preferences[String(panelId)] || {}), chatHidden: Boolean(session.preferences[String(userId)]?.chatHidden) };
    const entries = [['mute', prefs.muted ? 'このユーザーのミュートを解除' : '自分だけミュート'], ['camera', prefs.cameraHidden ? '映像を表示' : '映像を自分だけ非表示'], ['chat', prefs.chatHidden ? 'チャットを表示' : 'チャットを自分だけ非表示'], ['pin', prefs.pinned ? '固定解除' : '固定表示'], ['hide', prefs.hidden ? '表示' : '退避']];
    if (session.role === 'host') {
        const target = session.roster.find(person => String(person.user_id) === String(userId));
        entries.push(['host-mute', 'マイクを強制ミュート'], ['host-camera', 'カメラを強制オフ'], ['host-chat', 'チャットを強制オフ'], ['host-pin', target?.force_pinned ? 'パネルの強制固定を解除' : 'パネルを強制固定']);
        if (target?.role === 'audience') entries.push(['host-promote', 'スピーカーに昇格']);
        else if (target?.role === 'speaker') entries.push(['host-demote', 'リスナーに降格']);
        entries.push(['host-kick', 'セッションから追放']);
    }
    for (const [action, label] of entries) {
        const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = label;
        button.onclick = () => {
            menu.remove();
            if (action.startsWith('host-')) { void hostModerate(record, userId, action.slice(5)); return; }
            const prefs = session.preferences[String(panelId)] ||= {};
            if (action === 'mute') { prefs.muted = !prefs.muted; record.panel.querySelectorAll(`.call-person[data-panel-id="${CSS.escape(String(panelId))}"] video`).forEach(video => { video.muted = prefs.muted; }); }
            if (action === 'camera') { prefs.cameraHidden = !prefs.cameraHidden; }
            if (action === 'chat') { const chatPrefs = session.preferences[String(userId)] ||= {}; chatPrefs.chatHidden = !chatPrefs.chatHidden; record.panel.querySelectorAll(`.call-message[data-user-id="${CSS.escape(String(userId))}"]`).forEach(node => { node.hidden = chatPrefs.chatHidden; }); }
            if (action === 'pin') { prefs.pinned = !prefs.pinned; prefs.hidden = false; }
            if (action === 'hide') { prefs.hidden = !prefs.hidden; if (prefs.hidden) prefs.pinned = false; }
            rerenderRoster(record);
        };
        menu.append(button);
    }
    document.body.append(menu); menu.style.left = `${Math.min(x, innerWidth - menu.offsetWidth - 8)}px`; menu.style.top = `${Math.min(y, innerHeight - menu.offsetHeight - 8)}px`;
    const close = event => { if (!menu.contains(event.target)) { menu.remove(); document.removeEventListener('pointerdown', close, true); } };
    setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
}

async function hostModerate(record, userId, action) {
    const session = record.session;
    if (!session || session.role !== 'host') return;
    if (String(userId) === String(session.localUserId) && action !== 'pin') { console.log('自分にはこの操作を実行できません。'); return; }
    if (action === 'kick' && !globalThis.confirm('このユーザーを追放しますか？終了まで再参加できません。')) return;
    try {
        send(record, 'call:moderate', { target: userId, action });
    } catch (error) { status(error.message); }
}

function actionLabel(record, action, label, active = false) {
    const panel = record.panel;
    const button = panel?.querySelector(`.call-panel-footer [data-call-action="${action}"]`) || panel?.querySelector(`[data-call-action="${action}"]`);
    if (!button) return;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.classList.toggle('is-active', active);
    if (action === 'share' || action === 'transcribe' || action === 'chat') button.setAttribute('aria-pressed', String(active));
    const text = button.querySelector('[data-call-label]') || button.querySelector('span');
    if (text) text.textContent = label;
}

function closePersonTools(record) {
    clearTimeout(record.personToolsCloseTimer);
    record.personToolsCloseTimer = null;
    const active = record.activePersonTools;
    if (!active) return;
    record.activePersonTools = null;
    const { card, tools } = active;
    card.classList.remove('show-tools');
    if (tools.matches(':popover-open')) tools.hidePopover();
}

function positionPersonTools(record) {
    const active = record.activePersonTools;
    if (!active) return;
    const { card, tools } = active;
    if (!card.isConnected || !record.panel?.open) { closePersonTools(record); return; }
    const rect = card.getBoundingClientRect();
    const menu = tools.getBoundingClientRect();
    const fits = menu.width <= rect.width - 16 && menu.height <= rect.height - 16;
    const left = fits ? rect.right - menu.width - 8 : rect.right - 8;
    const top = fits ? rect.top + 8 : rect.top + 8 - menu.height;
    tools.style.left = `${Math.max(8, Math.min(left, innerWidth - menu.width - 8))}px`;
    tools.style.top = `${Math.max(8, Math.min(top, innerHeight - menu.height - 8))}px`;
}

function openPersonTools(record, card) {
    clearTimeout(record.personToolsCloseTimer);
    if (record.activePersonTools?.card === card) return;
    closePersonTools(record);
    const tools = card.querySelector('.call-person-tools');
    if (!tools) return;
    record.activePersonTools = { card, tools };
    tools.showPopover();
    positionPersonTools(record);
}

function createPanel(record) {
    if (record.panel) return record.panel;
    const panel = document.createElement('dialog');
    record.panel = panel;
    panel.className = 'call-panel';
    panel.setAttribute('aria-labelledby', `call-title-${record.uid}`);
    document.body.append(panel);
    panel.addEventListener('pointerover', event => {
        const card = event.target.closest('.call-person, .call-listeners li');
        if (card) openPersonTools(record, card);
    });
    panel.addEventListener('pointerout', event => {
        const card = event.target.closest('.call-person, .call-listeners li');
        if (!card || card.contains(event.relatedTarget) || card.classList.contains('show-tools')) return;
        record.personToolsCloseTimer = setTimeout(() => {
            if (!card.contains(document.activeElement)) closePersonTools(record);
        }, 120);
    });
    panel.addEventListener('focusin', event => {
        const card = event.target.closest('.call-person, .call-listeners li');
        if (card) openPersonTools(record, card);
    });
    panel.addEventListener('focusout', event => {
        const card = event.target.closest('.call-person, .call-listeners li');
        if (card && !card.contains(event.relatedTarget) && !card.matches(':hover') && !card.classList.contains('show-tools')) closePersonTools(record);
    });
    panel.addEventListener('scroll', () => positionPersonTools(record), true);
    panel.addEventListener('close', () => closePersonTools(record));
    panel.addEventListener('cancel', event => { event.preventDefault(); minimize(record); });
    panel.addEventListener('click', event => {
        const settingsDialog = panel.querySelector('[data-call-settings]');
        if (settingsDialog && !settingsDialog.hidden && event.target === settingsDialog) { setSettingsOpen(record, false); return; }
        const personControl = event.target.closest('[data-person-action], [data-host-action]');
        if (personControl) {
            const card = personControl.closest('[data-user-id]');
            if (!card || !record.session) return;
            const session = record.session;
            const id = card.dataset.userId;
            const panelId = card.dataset.panelId || id;
            if (personControl.dataset.hostAction) {
                void hostModerate(record, id, personControl.dataset.hostAction);
                return;
            }
            const prefs = session.preferences[panelId] ||= {};
            const action = personControl.dataset.personAction;
            if (action === 'mute') {
                prefs.muted = !prefs.muted;
                const self = panelId === String(session.localUserId) && !panelId.startsWith('screen:');
                if (self && session.forceMuted && !prefs.muted) { prefs.muted = true; return; }
                panel.querySelectorAll(`.call-person[data-panel-id="${CSS.escape(panelId)}"] video`).forEach(video => { if (!video.matches('[data-local-preview]')) video.muted = prefs.muted; });
                if (self) {
                    for (const track of localTracks(session, 'audio')) track.enabled = !prefs.muted;
                    if (prefs.muted) stopLocalTranscription(session); else startLocalTranscription(record, session);
                    sendState(record);
                }
                panel.querySelectorAll(`[data-panel-id="${CSS.escape(panelId)}"] [data-person-action="mute"]`).forEach(button => button.classList.toggle('is-active', prefs.muted));
                rerenderRoster(record);
            } else if (action === 'camera') {
                prefs.cameraHidden = !prefs.cameraHidden;
                panel.querySelectorAll(`.call-person[data-panel-id="${CSS.escape(panelId)}"]`).forEach(node => node.dataset.personCameraHidden = String(prefs.cameraHidden));
                panel.querySelectorAll(`[data-panel-id="${CSS.escape(panelId)}"] [data-person-action="camera"]`).forEach(button => button.classList.toggle('is-active', prefs.cameraHidden));
                rerenderRoster(record);
            } else if (action === 'chat') {
                const chatPrefs = session.preferences[id] ||= {};
                chatPrefs.chatHidden = !chatPrefs.chatHidden;
                panel.querySelectorAll(`.call-message[data-user-id="${CSS.escape(id)}"]`).forEach(node => { node.hidden = chatPrefs.chatHidden; });
                panel.querySelectorAll(`.call-person[data-user-id="${CSS.escape(id)}"]`).forEach(node => node.dataset.personChatHidden = String(chatPrefs.chatHidden));
                panel.querySelectorAll(`[data-user-id="${CSS.escape(id)}"] [data-person-action="chat"]`).forEach(button => button.classList.toggle('is-active', chatPrefs.chatHidden));
                rerenderRoster(record);
            } else if (action === 'pin') { prefs.pinned = !prefs.pinned; prefs.hidden = false; rerenderRoster(record); }
            else if (action === 'hide') { prefs.hidden = !prefs.hidden; if (prefs.hidden) prefs.pinned = false; rerenderRoster(record); }
            else rerenderRoster(record);
            return;
        }
        const personCard = event.target.closest('.call-person, .call-listeners li');
        if (personCard && !event.target.closest('button, input, a')) {
            personCard.classList.toggle('show-tools');
            if (personCard.classList.contains('show-tools')) openPersonTools(record, personCard);
            else closePersonTools(record);
            return;
        }
        if (!event.target.closest('.call-person-tools')) closePersonTools(record);
        const action = event.target.closest('[data-call-action]')?.dataset.callAction;
        if (!action) return;
        void perform(record, action).catch(error => {
            if (action === 'share') console.error(error);
            else status(error.message);
        });
    });
    panel.addEventListener('change', event => {
        if (event.target.matches('[data-call-device]')) {
            const kind = event.target.dataset.callDevice;
            void updateDevices(record, { [kind]: event.target.checked }).catch(error => status(error.message));
        }
        if (event.target.matches('[data-call-input-select]')) {
            void switchInputDevice(record, event.target.dataset.callInputSelect, event.target.value).catch(error => status(error.message));
        }
        if (event.target.matches('[data-person-volume]')) {
            const id = event.target.closest('[data-panel-id], [data-user-id]')?.dataset.panelId || event.target.closest('[data-user-id]')?.dataset.userId;
            if (id && record.session) {
                const volume = Number(event.target.value) / 100;
                record.session.preferences[id] ||= {}; record.session.preferences[id].volume = volume;
                panel.querySelectorAll(`.call-person[data-panel-id="${CSS.escape(id)}"] video`).forEach(video => { if (!video.matches('[data-local-preview]')) video.volume = volume; });
            }
        }
    });
    panel.addEventListener('input', event => {
        if (!event.target.matches('[data-call-quality]')) return;
        const level = ['low', 'middle', 'high'][Number(event.target.value)] || 'middle';
        applyQuality(record, level);
    });
    panel.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || panel.querySelector('[data-call-settings]')?.hidden) return;
        event.stopPropagation();
        setSettingsOpen(record, false);
    }, true);
    panel.addEventListener('contextmenu', event => {
        const target = event.target.closest('[data-user-id], .call-message[data-user-id]');
        if (!target || target.dataset.userId === String(record.session?.localUserId)) return;
        event.preventDefault(); showContextMenu(record, event.clientX, event.clientY, target.dataset.panelId || target.dataset.userId, target.dataset.userId);
    });
    panel.addEventListener('submit', event => {
        if (!event.target.matches('[data-call-chat]')) return;
        event.preventDefault();
        const input = event.target.elements.message;
        try { send(record, 'call:chat', { text: input.value }); input.value = ''; }
        catch (error) { status(error.message); }
    });
    return panel;
}

function showPanel(record) {
    createPanel(record);
    record.window?.show();
}

function minimize(record) {
    record.window?.minimize();
}

export async function openCall(kind, id, options = {}) {
    const key = keyFor(kind, id);
    const existing = calls.get(key);
    if (existing) { showPanel(existing); return; }
    if (openingKeys.has(key)) return;
    openingKeys.add(key);
    let info;
    let guestId = null;
    try {
        info = await request(`/server/api/calls/${kind === 'stage' ? 'stages' : 'dm'}/${encodeURIComponent(id)}`);
        if (options.requireActive && info.active === false) throw new Error('この通話は終了しました。');
        if (!getCurrentUser()) {
            if (kind !== 'stage' || !info.guest) throw new Error('この通話にはログインが必要です。');
            const guest = await request(`/server/api/calls/stages/${encodeURIComponent(id)}/guest-session`, { method: 'POST', body: {} });
            guestId = guest.guest_id;
        }
    } finally { openingKeys.delete(key); }
    if (calls.has(key)) { showPanel(calls.get(key)); return; }
    const role = info.role || 'member';
    const canPublish = role !== 'audience';
    const canCapture = canPublish && captureSupported();
    const session = { kind, id: String(id), key, role, owner: info.stage?.owner_id, guest: Boolean(guestId), guestId, localUserId: guestId || getCurrentUser()?.id, preferences: Object.create(null),
        ice: info.ice_servers || [], iceTransportPolicy: info.ice_transport_policy || 'all', bundlePolicy: info.bundle_policy || 'max-bundle', rtcpMuxPolicy: info.rtcp_mux_policy || 'require', peers: new Map(), roster: [], streams: new Map(),
        quality: 'middle', inputDevices: { audio: '', video: '' },
        local: typeof globalThis.MediaStream === 'function' ? new globalThis.MediaStream() : null, screen: null, joined: false, recognition: null, transcriptionEnabled: false, transcriptByUser: new Map(), screenShares: new Map(), captureVersion: 0 };
    const record = { key, uid: ++panelSequence, session, panel: null, window: null, pending: null, activePersonTools: null, personToolsCloseTimer: null };
    const stacked = calls.size > 0;
    calls.set(key, record);
    const node = createPanel(record);
    node.dataset.joined = 'false';
    node.dataset.kind = kind;
    node.dataset.chatOpen = 'true';
    node.innerHTML = callMarkup(kind, info, getCurrentUser(), canCapture, record.uid);
    session.localTile = node.querySelector('[data-local-tile]');
    actionLabel(record, 'transcribe', '文字起こしを表示');
    void refreshDeviceOptions(record);
    const shareButton = node.querySelector('[data-call-action="share"]');
    if (!rtcSupported() || !navigator.mediaDevices?.getDisplayMedia) {
        shareButton.disabled = true;
        actionLabel(record, 'share', '画面共有（未対応）');
    }
    const localPreview = node.querySelector('[data-local-preview]');
    if (localPreview) {
        localPreview.srcObject = session.local;
        const currentSession = session;
        const updateLocalPreview = () => {
            if (record.session !== currentSession) return;
            currentSession.localFrameReady = localPreview.videoWidth > 0 && localPreview.videoHeight > 0;
            placeLocalTiles(record, currentSession);
        };
        const checkLocalPreview = () => {
            updateLocalPreview();
            // Keep checking while the camera track is live even if it has not produced
            // its first frame yet (a muted MediaStreamTrack is common during startup).
            const activeVideo = localTracks(currentSession, 'video').some(track => track.readyState === 'live' && track.enabled);
            if (activeVideo && !currentSession.localFrameReady) currentSession.localPreviewTimer = setTimeout(checkLocalPreview, 120);
            else currentSession.localPreviewTimer = null;
        };
        currentSession.refreshLocalPreview = () => {
            if (record.panel !== node) return;
            clearTimeout(currentSession.localPreviewTimer);
            const videoTracks = localTracks(currentSession, 'video').filter(track => track.readyState === 'live' && track.enabled);
            // Rebind a video-only stream only when the underlying track set actually
            // changed. Reassigning srcObject reloads the element and resets
            // videoWidth/videoHeight to 0, which would make placeLocalTiles hide the tile
            // on every device change until (and unless) a new frame arrives.
            if (typeof globalThis.MediaStream === 'function') {
                const currentIds = (localPreview.srcObject?.getVideoTracks?.() || []).map(track => track.id).join(',');
                const nextIds = videoTracks.map(track => track.id).join(',');
                if (currentIds !== nextIds) localPreview.srcObject = new globalThis.MediaStream(videoTracks);
            }
            if (videoTracks.length) void localPreview.play().catch(() => {});
            checkLocalPreview();
        };
        localPreview.addEventListener('loadeddata', updateLocalPreview);
        localPreview.addEventListener('loadedmetadata', updateLocalPreview);
        localPreview.addEventListener('canplay', updateLocalPreview);
        localPreview.addEventListener('playing', updateLocalPreview);
        localPreview.addEventListener('resize', updateLocalPreview);
    }
    record.window = new AppWindow({ element: node, header: node.querySelector('.call-panel-header'), title: info.stage?.name || info.title || '通話', onClose: () => leaveCall(record), maximized: !stacked });
    if (stacked) {
        const offset = ((calls.size - 1) % 5) * 28;
        record.window.bounds.x = Math.min(innerWidth - record.window.bounds.width, 24 + offset);
        record.window.bounds.y = Math.min(innerHeight - record.window.bounds.height, 24 + offset);
        record.window.render();
    }
    record.window.controls.querySelector('[data-window-action="close"]').title = '閉じる';
    showPanel(record);
    if (guestId) {
        const chatInput = node.querySelector('[data-call-chat] input');
        const chatButton = node.querySelector('[data-call-chat] button');
        if (chatInput) chatInput.disabled = true;
        if (chatButton) chatButton.disabled = true;
        node.querySelector('[data-call-chat]')?.insertAdjacentHTML('beforebegin', '<p class="call-guest-chat-note nui-help-text">ゲストはコメントできません。</p>');
        const guestSession = session;
        void connectGuestRealtime().then(() => {
            if (record.session !== guestSession) return;
            if (info.stage?.status === 'scheduled') { guestSession.watching = true; send(record, 'call:watch'); }
            else if (info.stage?.status === 'live') return perform(record, 'join');
        }).catch(error => { if (record.session?.guestId === guestId) status(error.message); });
    } else if (kind === 'stage' && info.stage?.status === 'scheduled' && role === 'audience') {
        try { session.watching = true; send(record, 'call:watch'); }
        catch (error) { status(error.message); }
    }
    if (info.stage?.status === 'ended') {
        node.querySelector('[data-call-action="join"]')?.setAttribute('disabled', '');
        status('このステージは終了しました。');
    } else if (!guestId && info.stage?.status === 'live' && role === 'audience') {
        void perform(record, 'join').catch(error => status(error.message));
    }
}

function syncDeviceInputs(record, current = record.session) {
    const panel = record.panel;
    if (!panel || !current) return;
    for (const kind of ['audio', 'video']) {
        const active = localTracks(current, kind).some(track => track.readyState === 'live' && track.enabled);
        for (const input of panel.querySelectorAll(`[data-call-device="${kind}"]`)) {
            input.checked = active;
            input.disabled = current.role === 'audience' || !captureSupported()
                || (kind === 'audio' && current.forceMuted)
                || (kind === 'video' && current.forceCameraOff);
        }
    }
}

async function refreshDeviceOptions(record) {
    const panel = record.panel;
    if (!panel || !navigator.mediaDevices?.enumerateDevices) return;
    let devices;
    try { devices = await navigator.mediaDevices.enumerateDevices(); }
    catch (_) { return; }
    if (record.panel !== panel) return;
    const current = record.session;
    for (const kind of ['audio', 'video']) {
        const list = devices.filter(item => item.kind === (kind === 'audio' ? 'audioinput' : 'videoinput'));
        for (const select of panel.querySelectorAll(`[data-call-input-select="${kind}"]`)) {
            const chosen = current?.inputDevices?.[kind] || select.value || '';
            select.innerHTML = `<option value="">既定</option>${list.map((item, index) => `<option value="${escapeHTML(item.deviceId)}">${escapeHTML(item.label || `${kind === 'audio' ? 'マイク' : 'カメラ'} ${index + 1}`)}</option>`).join('')}`;
            select.value = list.some(item => item.deviceId === chosen) ? chosen : '';
        }
    }
}

async function switchInputDevice(record, kind, deviceId) {
    const current = record.session;
    if (!current || current.role === 'audience') return;
    current.inputDevices[kind] = deviceId || '';
    const previous = localTracks(current, kind).find(track => track.readyState === 'live');
    if (!previous || !captureSupported()) return;
    const version = ++current.captureVersion;
    try {
        const constraints = kind === 'audio'
            ? { audio: deviceId ? { deviceId: { exact: deviceId } } : true }
            : { video: videoCaptureConstraints(deviceId) };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (record.session !== current || current.captureVersion !== version) { stream.getTracks().forEach(track => track.stop()); return; }
        const next = stream.getTracks().find(track => track.kind === kind);
        if (!next) { stream.getTracks().forEach(track => track.stop()); return; }
        next.contentHint = kind === 'audio' ? 'speech' : 'motion';
        for (const peer of current.peers.values()) {
            const sender = peer.pc.getSenders().find(item => item.track === previous);
            if (sender) await sender.replaceTrack(next);
        }
        current.local.removeTrack(previous);
        previous.stop();
        current.local.addTrack(next);
        for (const peer of current.peers.values()) addTrack(peer, next, current.local);
        if (kind === 'audio') { stopLocalTranscription(current); startLocalTranscription(record, current); }
        current.refreshLocalPreview?.();
        if (current.joined) sendState(record);
        status('');
    } catch (error) {
        status(`機器を変更できません: ${error.message}`);
    }
    if (record.session === current) {
        syncDeviceInputs(record, current);
        void refreshDeviceOptions(record);
    }
}

function applyQuality(record, level) {
    const current = record.session;
    if (!current || !QUALITY_PROFILES[level]) return;
    current.quality = level;
    for (const peer of current.peers.values()) {
        tunePeerSenders(peer, current);
    }
    const output = record.panel?.querySelector('[data-call-quality-value]');
    if (output) output.textContent = qualityProfile(current).label;
}

function setSettingsOpen(record, open) {
    const panel = record.panel;
    const modal = panel?.querySelector('[data-call-settings]');
    if (!modal) return;
    modal.hidden = !open;
    if (open) {
        const level = record.session?.quality || 'middle';
        const slider = modal.querySelector('[data-call-quality]');
        if (slider) slider.value = String(['low', 'middle', 'high'].indexOf(level));
        const output = modal.querySelector('[data-call-quality-value]');
        if (output) output.textContent = qualityProfile(record.session).label;
        void refreshDeviceOptions(record);
        slider?.focus();
    } else {
        panel.querySelector('[data-call-action="settings"]')?.focus();
    }
}


async function updateDevices(record, requested) {
    const panel = record.panel;
    const current = record.session;
    if (!current || current.role === 'audience') return;
    if (!captureSupported() || !current.local) {
        for (const input of panel.querySelectorAll('[data-call-device]')) { input.checked = false; input.disabled = true; }
        return;
    }
    const version = ++current.captureVersion;
    const wanted = kind => requested?.[kind] ?? Boolean(panel.querySelector(`[data-call-device="${kind}"]`)?.checked);
    for (const kind of ['audio', 'video']) {
        const track = localTracks(current).find(t => t.kind === kind);
        if (!wanted(kind) && track) {
            for (const peer of current.peers.values()) {
                const sender = peer.pc.getSenders().find(s => s.track === track);
                if (sender) peer.pc.removeTrack(sender);
            }
            track.stop(); current.local.removeTrack(track);
            if (kind === 'audio') stopLocalTranscription(current);
        }
    }
    try {
        const wantAudio = wanted('audio') && !localTracks(current, 'audio').length;
        const wantVideo = wanted('video') && !localTracks(current, 'video').length;
        if (wantAudio || wantVideo) {
            const device = kind => current.inputDevices?.[kind] ? { deviceId: { exact: current.inputDevices[kind] } } : true;
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: wantAudio ? device('audio') : false,
                video: wantVideo ? videoCaptureConstraints(current.inputDevices?.video || '') : false,
            });
            for (const track of stream.getTracks()) track.contentHint = track.kind === 'audio' ? 'speech' : 'motion';
            if (record.session !== current || current.captureVersion !== version) { stream.getTracks().forEach(t => t.stop()); return; }
            for (const track of stream.getTracks()) {
                if (!wanted(track.kind)) { track.stop(); continue; }
                current.local.addTrack(track);
                for (const peer of current.peers.values()) peer.pc.addTrack(track, current.local);
            }
        }
        status('');
    } catch (error) {
        console.error('[calls] device capture failed', error);
        status(`機器を使用できません: ${error.message}`);
    }
    if (record.session !== current) return;
    syncDeviceInputs(record, current);
    void refreshDeviceOptions(record);
    if (wanted('audio') && current.preferences[String(current.localUserId)]) current.preferences[String(current.localUserId)].muted = false;
    const localVideo = current.localTile?.querySelector('video');
    current.localFrameReady = Boolean(localVideo?.videoWidth && localVideo?.videoHeight);
    placeLocalTiles(record, current);
    current.refreshLocalPreview?.();
    if (current.joined) sendState(record);
    if (wanted('audio')) startLocalTranscription(record, current);
}

function sendState(record) {
    const session = record.session;
    if (session?.joined) send(record, 'call:state', { muted: !hasActiveMicrophone(session), camera: !!localTracks(session, 'video').length, transcription_enabled: session.transcriptionEnabled });
}

function hasActiveMicrophone(current) {
    return localTracks(current, 'audio').some(track => track.readyState === 'live' && track.enabled);
}

function startLocalTranscription(record, current) {
    if (!current?.transcriptionEnabled || current.role === 'audience' || current.recognition || !hasActiveMicrophone(current)) return;
    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = event => {
        if (record.session !== current || !current.transcriptionEnabled || current.role === 'audience' || !hasActiveMicrophone(current)) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (!event.results[i].isFinal) continue;
            try { send(record, 'call:transcript', { text: event.results[i][0].transcript.slice(0, 2000) }); }
            catch (error) { status(error.message); }
        }
    };
    recognition.onerror = () => {
        if (current.recognition !== recognition) return;
        current.recognition = null;
        status('文字起こしを開始できませんでした。');
    };
    recognition.onend = () => {
        if (current.recognition !== recognition) return;
        current.recognition = null;
        if (record.session === current && current.transcriptionEnabled && hasActiveMicrophone(current)) setTimeout(() => startLocalTranscription(record, current), 300);
    };
    current.recognition = recognition;
    try { recognition.start(); }
    catch (_) { current.recognition = null; }
}

function stopLocalTranscription(current) {
    if (!current?.recognition) return;
    const recognition = current.recognition;
    current.recognition = null;
    recognition.onend = null;
    recognition.onerror = null;
    try { recognition.stop(); } catch (_) {}
}

function renderTranscripts(record, current = record.session) {
    const panel = record.panel;
    if (!current || !panel) return;
    panel.querySelectorAll('[data-transcript-user]').forEach(card => {
        const box = card.querySelector('[data-transcript-box]');
        if (!box) return;
        box.hidden = !current.transcriptionEnabled || card.classList.contains('call-person-screen');
        box.textContent = current.transcriptByUser.get(card.dataset.transcriptUser) || '';
        box.scrollTop = box.scrollHeight;
    });
}

function syncScreenShares(current, roster) {
    const present = new Set(roster.map(person => String(person.user_id)));
    for (const id of current.screenShares.keys()) if (!present.has(String(id))) current.screenShares.delete(id);
    for (const person of roster) {
        if (person.screen_stream_id) current.screenShares.set(String(person.user_id), { streamId: person.screen_stream_id, label: person.screen_label || `@${String(person.handle || person.name).replace(/^@/, '')}のスクリーン` });
        else current.screenShares.delete(String(person.user_id));
    }
}

function addTrack(peer, track, stream) {
    if (!peer.pc.getSenders().some(sender => sender.track === track)) peer.pc.addTrack(track, stream);
}

function findPersonCard(record, userId, screen = false) {
    const expectedId = screen ? `screen:${userId}` : String(userId);
    return [...(record.panel?.querySelectorAll('.call-person[data-transcript-user]') || [])]
        .find(card => card.dataset.transcriptUser === expectedId);
}

function placeVideoInCard(record, remote, current) {
    const share = current.screenShares.get(String(remote.userId));
    const isScreen = remote.screenStream || share?.streamId === remote.streamId;
    if (share?.streamId === remote.streamId) remote.screenStream = true;
    remote.tile.dataset.panelId = isScreen ? `screen:${remote.userId}` : String(remote.userId);
    const cameraHidden = Boolean(current.preferences[String(remote.userId)]?.cameraHidden);
    const cameraAllowed = !cameraHidden && (isScreen || current.roster.find(person => String(person.user_id) === String(remote.userId))?.camera === true);
    if (!cameraAllowed || remote.tile.dataset.video !== 'true') {
        const card = findPersonCard(record, remote.userId, isScreen);
        if (card && !card.querySelector('.call-person-avatar') && remote.fallback) {
            card.prepend(remote.fallback);
            remote.fallback = null;
        }
        card?.classList.remove('has-camera');
        // Keep the video element in the document (hidden) so it keeps decoding and can
        // reappear without waiting for a fresh load.
        parkMedia(record, remote.tile);
        return;
    }
    const card = findPersonCard(record, remote.userId, isScreen);
    if (!card) return;
    const fallback = card.querySelector('.call-person-avatar');
    if (fallback && fallback !== remote.tile) {
        remote.fallback = fallback.cloneNode(true);
        fallback.replaceWith(remote.tile);
    } else if (remote.tile.parentElement !== card) {
        const prior = card.querySelector('.call-person-avatar');
        if (prior) {
            remote.fallback = prior.cloneNode(true);
            prior.replaceWith(remote.tile);
        } else {
            card.append(remote.tile);
        }
    }
    remote.tile.classList.toggle('call-person-screen-share', isScreen);
    remote.tile.querySelector('.call-person-camera-label')?.remove();
    remote.tile.closest('.call-person')?.classList.toggle('has-camera', remote.tile.dataset.video === 'true');
}

function placeLocalTiles(record, current = record.session) {
    const panel = record.panel;
    if (!current || !panel) return;
    const localCard = findPersonCard(record, current.localUserId);
    const localTile = current.localTile;
    const preview = localTile?.querySelector('video');
    const activeVideo = localTracks(current, 'video').some(track => track.readyState === 'live' && !track.muted && track.enabled);
    localTile?.classList.toggle('is-capturing', activeVideo);
    const cameraHidden = Boolean(current.preferences[String(current.localUserId)]?.cameraHidden);
    const hasVideo = Boolean(!cameraHidden && current.localFrameReady && preview?.videoWidth > 0 && preview?.videoHeight > 0 && activeVideo);
    localTile?.classList.toggle('has-video', hasVideo);
    if (localTile && localCard && current.role !== 'audience') {
        if (hasVideo) {
            const avatar = localCard.querySelector('.call-person-avatar');
            if (avatar) { current.localFallback = avatar.cloneNode(true); avatar.replaceWith(localTile); }
            else if (localTile.parentElement !== localCard) localCard.append(localTile);
            localCard.classList.add('has-camera');
        } else {
            // Camera off/not ready: restore the avatar and keep the preview element in
            // the document (parked) so it keeps decoding and can be re-shown instantly.
            if (localTile.parentElement?.classList?.contains('call-person')) {
                const parent = localTile.parentElement;
                const fallback = current.localFallback || parent.querySelector('.call-person-avatar');
                if (fallback) localTile.replaceWith(fallback.cloneNode(true));
                parent.classList.remove('has-camera');
                parkMedia(record, localTile);
            }
            localCard.classList.remove('has-camera');
        }
    } else if (localTile && current.role === 'audience' && localTile.parentElement?.classList?.contains('call-person')) {
        parkMedia(record, localTile);
    }
    if (current.screenPreview) {
        const screenCard = findPersonCard(record, current.localUserId, true);
        if (screenCard) {
            const screenAvatar = screenCard.querySelector('.call-person-avatar');
            if (screenAvatar) { current.screenFallback = screenAvatar.cloneNode(true); screenAvatar.replaceWith(current.screenPreview); }
            else if (current.screenPreview.parentElement !== screenCard) screenCard.append(current.screenPreview);
            screenCard.classList.add('has-camera');
        } else {
            parkMedia(record, current.screenPreview);
        }
        current.screenPreview.dataset.panelId = `screen:${current.localUserId}`;
    }
}

function createPeer(record, userId) {
    if (!rtcSupported()) return null;
    const current = record.session;
    if (!current) return null;
    if (current.peers.has(userId)) return current.peers.get(userId);
    const pc = new globalThis.RTCPeerConnection({
        iceServers: current.ice,
        iceTransportPolicy: current.iceTransportPolicy,
        // max-bundle で音声・映像・画面共有を単一トランスポートへ集約し、
        // ICE candidate 数・SDP サイズ・接続確立時間を削減する。
        bundlePolicy: current.bundlePolicy || 'max-bundle',
        rtcpMuxPolicy: current.rtcpMuxPolicy || 'require',
    });
    const peer = { pc, id: userId, makingOffer: false, ignoreOffer: false, settingAnswer: false,
        polite: String(current.localUserId).localeCompare(String(userId)) > 0, candidates: [], current };
    current.peers.set(userId, peer);
    peer.statsTimer = setInterval(() => { void adaptPeerSenders(peer, current); }, 5000);
    pc.onicecandidate = ({ candidate }) => {
        if (candidate && record.session === current && current.joined) send(record, 'call:signal', { to: userId, data: { candidate: candidate.toJSON() } });
    };
    pc.onnegotiationneeded = async () => {
        if (record.session !== current || !current.joined) return;
        try {
            peer.makingOffer = true;
            await pc.setLocalDescription();
            tunePeerSenders(peer, current);
            if (record.session === current && current.joined) send(record, 'call:signal', { to: userId, data: { description: pc.localDescription.toJSON() } });
        } catch (error) { if (record.session === current) status(`接続できません: ${error.message}`); }
        finally { peer.makingOffer = false; }
    };
    pc.ontrack = event => {
        if (record.session !== current) return;
        if (current.kind === 'stage' && current.role === 'host' && current.roster.find(r => r.user_id === userId)?.role !== 'speaker') return;
        // ジッターによる音切れを避けつつ遅延も抑えるため、音声の待ち幅を短く固定する。
        if (event.track.kind === 'audio' && event.receiver && 'jitterBufferTarget' in event.receiver) {
            try { event.receiver.jitterBufferTarget = 40; } catch (_) {}
        }
        const stream = event.streams[0] || new globalThis.MediaStream([event.track]);
        const streamKey = `${userId}:${stream.id}`;
        let remote = current.streams.get(streamKey);
        if (!remote) {
            remote = { stream, streamId: stream.id, userId, tile: document.createElement('div'), receivedFrame: false };
            remote.tile.className = 'call-person-camera';
            remote.tile.dataset.userId = String(userId);
            remote.tile.dataset.streamId = stream.id;
            const video = document.createElement('video');
            video.autoplay = true; video.playsInline = true; video.srcObject = stream;
            remote.tile.append(video);
            current.streams.set(streamKey, remote);
            placeVideoInCard(record, remote, current);
            void video.play().catch(() => { if (record.session === current) { record.panel.querySelector('[data-call-action="play"]').hidden = false; status('「音声を再生」を押すと音声が流れます。'); } });
        }
        const video = remote.tile.querySelector('video');
    const pref = current.preferences[String(remote.userId)] || {};
    video.muted = Boolean(pref.muted);
    video.volume = Number.isFinite(pref.volume) ? pref.volume : 1;
        const updateVideo = () => {
            const isScreen = current.screenShares.get(String(userId))?.streamId === remote.streamId;
            // 受信側でも種別を contentHint に反映し、ステージのホストが転送する
            // 際のビットレート／劣化方針を画面共有向けに最適化する。
            const hint = isScreen ? 'detail' : 'motion';
            for (const track of stream.getVideoTracks()) if (track.contentHint !== hint) track.contentHint = hint;
            const cameraHidden = Boolean(current.preferences[String(userId)]?.cameraHidden);
            const peerCameraEnabled = !cameraHidden && (isScreen || current.roster.find(person => String(person.user_id) === String(userId))?.camera === true);
            const activeVideo = peerCameraEnabled && remote.receivedFrame && video.videoWidth > 0 && video.videoHeight > 0 && stream.getVideoTracks().some(track => track.readyState === 'live' && !track.muted);
            remote.tile.dataset.video = String(activeVideo);
            if (activeVideo) {
                const desired = findPersonCard(record, userId, isScreen);
                // Re-place whenever the tile was parked or wiped by a roster re-render.
                if (desired && remote.tile.parentElement !== desired) placeVideoInCard(record, remote, current);
                desired?.classList.add('has-camera');
                if (!remote.observing) observeFrame();
            } else {
                const card = findPersonCard(record, userId, isScreen);
                if (card && remote.tile.parentElement === card) {
                    if (remote.fallback && !card.querySelector('.call-person-avatar')) card.prepend(remote.fallback.cloneNode(true));
                    card.classList.remove('has-camera');
                }
                // Never detach the video element: keep it decoded but hidden so it can
                // become ready again without a fresh load.
                parkMedia(record, remote.tile);
            }
        };
        remote.refreshVideo = updateVideo;
        const observeFrame = () => {
            if (typeof video.requestVideoFrameCallback !== 'function') return;
            remote.observing = true;
            video.requestVideoFrameCallback((_now, metadata) => {
                if (record.session !== current || !current.streams.has(streamKey)) { remote.observing = false; return; }
                remote.receivedFrame = metadata.width > 0 && metadata.height > 0;
                updateVideo();
                // Keep observing until the first real frame; later readiness changes are
                // picked up by the resize/playing listeners and roster refreshes.
                if (!remote.receivedFrame && stream.getVideoTracks().some(track => track.readyState === 'live' && !track.muted)) observeFrame();
                else remote.observing = false;
            });
        };
        video.addEventListener('loadeddata', () => { remote.receivedFrame = video.videoWidth > 0 && video.videoHeight > 0; updateVideo(); });
        video.addEventListener('playing', () => { remote.receivedFrame = video.videoWidth > 0 && video.videoHeight > 0; updateVideo(); });
        // Dimension changes (e.g. after a DOM move) may surface as resize, not rVFC.
        video.addEventListener('resize', () => { remote.receivedFrame = video.videoWidth > 0 && video.videoHeight > 0; updateVideo(); });
        observeFrame();
        updateVideo();
        event.track.addEventListener('mute', () => { remote.receivedFrame = false; updateVideo(); });
        event.track.addEventListener('unmute', () => { observeFrame(); updateVideo(); });
        event.track.addEventListener('ended', updateVideo);
        if (current.kind === 'stage' && current.role === 'host') {
            for (const target of current.peers.values()) if (target.id !== userId) addTrack(target, event.track, stream);
        }
        event.track.onended = () => {
            for (const target of current.peers.values()) {
                const sender = target.pc.getSenders().find(s => s.track === event.track);
                if (sender) target.pc.removeTrack(sender);
            }
            if (!stream.getTracks().some(track => track.readyState === 'live')) {
                const personCard = remote.tile.closest('.call-person');
                if (personCard && remote.fallback && !personCard.querySelector('.call-person-avatar')) personCard.prepend(remote.fallback.cloneNode(true));
                personCard?.classList.remove('has-camera');
                remote.tile.remove();
                current.streams.delete(streamKey);
            }
        };
    };
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') void adaptPeerSenders(peer, current);
        if (pc.connectionState === 'failed') {
            status('音声・映像に接続できません。');
            // 一時的な経路断で接続が死んだままにせず、ICE を再起動して復旧を試みる。
            if (!peer.restartTimer && typeof pc.restartIce === 'function') {
                peer.restartTimer = setTimeout(() => {
                    peer.restartTimer = null;
                    if (record.session !== current || !current.joined || peer.pc !== pc || pc.connectionState !== 'failed') return;
                    try { pc.restartIce(); } catch (_) { /* 未対応ブラウザは放置。 */ }
                }, 1500);
            }
        } else if (peer.restartTimer && pc.connectionState === 'connected') {
            clearTimeout(peer.restartTimer);
            peer.restartTimer = null;
        }
    };
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.addTransceiver('video', { direction: 'recvonly' });
    if (current.role !== 'audience') {
        for (const track of localTracks(current)) addTrack(peer, track, current.local);
        for (const track of current.screen?.getTracks() || []) addTrack(peer, track, current.screen);
    }
    if (current.kind === 'stage' && current.role === 'host') {
        for (const remote of current.streams.values()) if (remote.userId !== userId) {
            for (const track of remote.stream.getTracks()) addTrack(peer, track, remote.stream);
        }
    }
    // 交渉前のベストエフォート適用（交渉後に onnegotiationneeded / signal で再適用される）。
    tunePeerSenders(peer, current);
    return peer;
}

function closePeer(record, userId) {
    const current = record.session;
    const peer = current?.peers.get(userId);
    if (!peer) return;
    peer.pc.onnegotiationneeded = null;
    clearTimeout(peer.restartTimer);
    peer.restartTimer = null;
    clearInterval(peer.statsTimer);
    peer.closed = true;
    peer.pc.close();
    current.peers.delete(userId);
    for (const [key, remote] of current.streams) if (remote.userId === userId) {
        for (const track of remote.stream.getTracks()) {
            for (const other of current.peers.values()) {
                const sender = other.pc.getSenders().find(s => s.track === track);
                if (sender) other.pc.removeTrack(sender);
            }
        }
        remote.tile.remove(); current.streams.delete(key);
    }
}

function applyRoster(record, roster) {
    const panel = record.panel;
    if (!record.session?.joined) return;
    const current = record.session;
    const previous = current.roster;
    current.roster = roster;
    const mine = roster.find(entry => String(entry.user_id) === String(current.localUserId));
    if (!mine) { leaveCall(record); return; }
    const changedRole = current.role !== mine.role;
    current.role = mine.role;
    current.forceMuted = Boolean(mine.force_muted);
    current.forceCameraOff = Boolean(mine.force_camera_off);
    if (changedRole) {
        ++current.captureVersion;
        localTracks(current).forEach(track => { track.stop(); current.local.removeTrack(track); });
        stopSharing(record); stopLocalTranscription(current);
        for (const input of panel.querySelectorAll('[data-call-device]')) { input.checked = false; input.disabled = mine.role === 'audience' || !captureSupported(); }
        for (const id of [...current.peers.keys()]) closePeer(record, id);
        current.localFrameReady = false;
        current.refreshLocalPreview?.();
        status(mine.role === 'audience' ? '視聴者に切り替わりました。' : 'スピーカーになりました。');
    }
    // Enforce host force-actions even when they arrive through the roster alone
    // (e.g. reconnect): the local capture tracks must actually stop/disable.
    if (current.forceMuted) {
        for (const track of localTracks(current, 'audio')) track.enabled = false;
        stopLocalTranscription(current);
    }
    if (current.forceCameraOff) {
        for (const track of localTracks(current, 'video')) {
            for (const peer of current.peers.values()) {
                const sender = peer.pc.getSenders().find(item => item.track === track);
                if (sender) peer.pc.removeTrack(sender);
            }
            track.stop(); current.local.removeTrack(track);
        }
        if (current.localFrameReady) current.localFrameReady = false;
        current.refreshLocalPreview?.();
    }
    const targets = roster.filter(r => String(r.user_id) !== String(current.localUserId) &&
        (current.kind !== 'stage' || current.role === 'host' || r.role === 'host'));
    for (const id of [...current.peers.keys()]) {
        const before = previous.find(r => r.user_id === id);
        const after = roster.find(r => r.user_id === id);
        if (!targets.some(t => t.user_id === id) || before?.role !== after?.role) closePeer(record, id);
    }
    for (const target of targets) createPeer(record, target.user_id);
    syncScreenShares(current, roster);
    renderParticipants(panel, roster, current.kind, current.localUserId, current.screenShares, current.role === 'host', current.preferences);
    placeLocalTiles(record);
    applyPersonPreferences(record);
    for (const remote of current.streams.values()) {
        placeVideoInCard(record, remote, current);
        remote.refreshVideo?.();
    }
    renderTranscripts(record);
    const deviceControls = panel.querySelector('[data-call-device-controls]');
    if (deviceControls) deviceControls.hidden = current.role === 'audience';
    const prejoinSelectors = panel.querySelector('[data-call-prejoin-selectors]');
    if (prejoinSelectors) prejoinSelectors.hidden = current.role === 'audience';
    const settingsDevices = panel.querySelector('[data-call-settings-devices]');
    if (settingsDevices) settingsDevices.hidden = current.role === 'audience';
    const localTile = current.localTile;
    if (localTile) {
        localTile.hidden = current.role === 'audience' || !captureSupported();
        placeLocalTiles(record);
    }
    panel.querySelector('[data-call-publisher-tools]').hidden = current.role === 'audience';
    panel.querySelector('[data-call-action="share"]').hidden = current.role === 'audience';
    const chatDisabled = Boolean(mine.chat_disabled || current.guest);
    for (const input of panel.querySelectorAll('[data-call-chat] input, [data-call-chat] button')) input.disabled = chatDisabled;
    syncDeviceInputs(record, current);
    if (changedRole && current.role !== 'audience') startLocalTranscription(record, current);
}

async function signal(record, event) {
    const current = record.session;
    if (!current?.joined || !current.roster.some(r => r.user_id === event.from)) return;
    if (current.kind === 'stage' && current.role !== 'host' && event.from !== current.owner) return;
    const peer = createPeer(record, event.from);
    if (!peer) return;
    const { pc } = peer;
    const { description, candidate } = event.data;
    if (description) {
        const ready = !peer.makingOffer && (pc.signalingState === 'stable' || peer.settingAnswer);
        const collision = description.type === 'offer' && !ready;
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        peer.settingAnswer = description.type === 'answer';
        await pc.setRemoteDescription(description);
        peer.settingAnswer = false;
        for (const queued of peer.candidates.splice(0)) await pc.addIceCandidate(queued);
        if (description.type === 'offer') {
            await pc.setLocalDescription();
            tunePeerSenders(peer, current);
            if (record.session === current) send(record, 'call:signal', { to: event.from, data: { description: pc.localDescription.toJSON() } });
        }
    } else if (candidate && !peer.ignoreOffer) {
        if (pc.remoteDescription) await pc.addIceCandidate(candidate);
        else peer.candidates.push(candidate);
    }
}

function appendMessage(record, event) {
    const log = record.panel?.querySelector('[data-call-messages]');
    if (!log) return;
    log.querySelector('.call-chat-empty')?.remove();
    const line = document.createElement('div');
    line.className = 'call-message';
    line.dataset.userId = String(event.user_id);
    const name = String(event.name || '参加者');
    const avatar = document.createElement('span');
    avatar.className = 'call-message-avatar nui-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    const userId = event.user_id;
    if (userId && !String(userId).startsWith('guest:')) {
        const image = document.createElement('img');
        image.alt = '';
        image.loading = 'lazy';
        image.src = getUserIconUrl({ id: userId });
        image.addEventListener('error', () => {
            avatar.textContent = Array.from(name)[0] || '?';
        }, { once: true });
        avatar.append(image);
    } else {
        avatar.textContent = Array.from(name)[0] || '?';
    }
    const content = document.createElement('div');
    content.className = 'call-message-content';
    const author = document.createElement('div');
    author.className = 'call-message-author';
    const handle = event.guest ? '' : String(event.name || '参加者');
    const displayName = document.createElement('strong');
    displayName.textContent = handle ? `@${handle}` : name;
    author.append(displayName);
    if (!event.guest && !String(event.user_id || '').startsWith('guest:')) {
        const nyaitterId = document.createElement('span');
        nyaitterId.className = 'call-message-id';
        nyaitterId.textContent = formatNyaitterId({ nyaitter_id: event.nyaitter_id || event.user_id });
        author.append(nyaitterId);
    }
    if (!event.guest && handle) author.setAttribute('aria-label', `${displayName.textContent}${formatNyaitterId({ nyaitter_id: event.nyaitter_id || event.user_id })}`);
    const text = document.createElement('p');
    text.textContent = event.text;
    content.append(author, text);
    line.append(avatar, content);
    log.append(line);
    if (record.session?.preferences[String(event.user_id)]?.chatHidden) line.hidden = true;
    while (log.childElementCount > 300) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
}

function appendTranscript(record, event) {
    const current = record.session;
    const panel = record.panel;
    if (!current?.transcriptionEnabled || !panel) return;
    const key = String(event.user_id);
    const previous = current.transcriptByUser.get(key) || '';
    current.transcriptByUser.set(key, `${previous}${previous ? ' ' : ''}${String(event.text || '')}`.slice(-600));
    const card = [...panel.querySelectorAll('[data-transcript-user]')].find(node => node.dataset.transcriptUser === key);
    const box = card?.querySelector('[data-transcript-box]');
    if (box) { box.hidden = false; box.textContent = current.transcriptByUser.get(key); box.scrollTop = box.scrollHeight; }
}

function handleScreenShare(record, event) {
    const current = record.session;
    const panel = record.panel;
    if (!current || !panel) return;
    const userId = String(event.user_id);
    if (event.active && event.stream_id) current.screenShares.set(userId, { streamId: String(event.stream_id), label: String(event.label || 'スクリーン') });
    else current.screenShares.delete(userId);
    renderParticipants(panel, current.roster, current.kind, current.localUserId, current.screenShares, current.role === 'host', current.preferences);
    placeLocalTiles(record, current);
    applyPersonPreferences(record);
    for (const remote of current.streams.values()) {
        placeVideoInCard(record, remote, current);
        remote.refreshVideo?.();
    }
    renderTranscripts(record);
}

export function handleCallEvent(event) {
    if (!event.type.startsWith('call:')) return false;
    if (event.type === 'call:error') {
        for (const record of calls.values()) {
            if (record.pending && record.pending.id === event.request_id) { record.pending.reject(new Error(event.message)); record.pending = null; }
        }
        status(event.message); return true;
    }
    const record = calls.get(event.room);
    if (!record) return true;
    const session = record.session;
    const panel = record.panel;
    if (event.type === 'call:stage') {
        if (event.status === 'live') {
            panel.querySelector('[data-call-waiting]')?.remove();
            status('');
            if (!session.joined) void perform(record, 'join').catch(error => status(error.message));
        } else if (event.status === 'ended') {
            leaveCall(record);
            void showAppAlert('このステージは終了しました。');
        }
    } else if (event.type === 'call:joined') {
        if (!record.pending || event.request_id !== record.pending.id) return true;
        session.joined = true; session.role = event.role; session.owner = event.owner_id;
        record.pending.resolve(); record.pending = null;
        panel.dataset.joined = 'true';
        const prejoin = panel.querySelector('[data-call-prejoin]');
        if (prejoin) prejoin.hidden = true;
        const deviceControls = panel.querySelector('[data-call-device-controls]');
        if (deviceControls) panel.querySelector('[data-call-device-target]').append(deviceControls);
        panel.dataset.chatOpen = String(panel.clientWidth >= 760);
        actionLabel(record, 'chat', session.kind === 'stage' ? 'コメント' : 'チャット', panel.dataset.chatOpen === 'true');
        record.window.controls.querySelector('[data-window-action="close"]').title = '退出して閉じる';
        for (const section of panel.querySelectorAll('[data-call-in-session]')) section.hidden = false;
        for (const element of panel.querySelectorAll('[data-call-chat] input, [data-call-chat] button')) element.disabled = Boolean(session.guest);
        applyRoster(record, event.roster); status('');
    } else if (event.type === 'call:roster') applyRoster(record, event.roster);
    else if (event.type === 'call:moderated') {
        if (event.action === 'mute') {
            session.forceMuted = true;
            ++session.captureVersion;
            for (const track of localTracks(session, 'audio')) track.enabled = false;
            const input = panel.querySelector('[data-call-device="audio"]'); if (input) { input.checked = false; input.disabled = true; }
            stopLocalTranscription(session); sendState(record);
        } else if (event.action === 'camera') {
            session.forceCameraOff = true;
            ++session.captureVersion;
            for (const track of localTracks(session, 'video')) { for (const peer of session.peers.values()) { const sender = peer.pc.getSenders().find(item => item.track === track); if (sender) peer.pc.removeTrack(sender); } track.stop(); session.local.removeTrack(track); }
            const input = panel.querySelector('[data-call-device="video"]'); if (input) { input.checked = false; input.disabled = true; }
            session.localFrameReady = false;
            session.refreshLocalPreview?.();
            placeLocalTiles(record, session); sendState(record);
        }
        const messages = { chat: 'ホストによりチャットが無効になりました。', mute: 'ホストによりマイクがミュートされました。', camera: 'ホストによりカメラがオフになりました。', pin: 'ホストによりパネルが固定されました。', promote: 'ホストによりスピーカーに昇格しました。', demote: 'ホストによりリスナーに降格しました。' };
        status(messages[event.action] || 'ホストにより設定が変更されました。');
    }
    else if (event.type === 'call:kicked') { const message = event.message; leaveCall(record); void showAppAlert(message); }
    else if (event.type === 'call:screen') handleScreenShare(record, event);
    else if (event.type === 'call:signal') void signal(record, event).catch(error => status(`接続エラー: ${error.message}`));
    else if (event.type === 'call:chat') appendMessage(record, event);
    else if (event.type === 'call:transcript') appendTranscript(record, event);
    else if (event.type === 'call:ended') { const message = event.message; leaveCall(record); void showAppAlert(message); }
    return true;
}

function stopSharing(record) {
    const session = record.session;
    const panel = record.panel;
    if (!session?.screen || !panel) return;
    const current = session;
    const stream = current.screen; current.screen = null;
    try { send(record, 'call:screen', { active: false, stream_id: stream.id }); } catch (_) {}
    current.screenShares.delete(String(current.localUserId));
    current.screenPreview?.remove(); current.screenPreview = null;
    renderParticipants(panel, current.roster, current.kind, current.localUserId, current.screenShares, current.role === 'host', current.preferences);
    placeLocalTiles(record, current);
    applyPersonPreferences(record);
    for (const remote of current.streams.values()) { placeVideoInCard(record, remote, current); remote.refreshVideo?.(); }
    for (const track of stream.getTracks()) {
        track.onended = null;
        for (const peer of current.peers.values()) {
            const sender = peer.pc.getSenders().find(s => s.track === track);
            if (sender) peer.pc.removeTrack(sender);
        }
        track.stop();
    }
    actionLabel(record, 'share', '画面を共有');
}

async function perform(record, action) {
    const session = record.session;
    const panel = record.panel;
    if (action === 'leave' || action === 'cancel') { leaveCall(record); return; }
    if (action === 'settings') { setSettingsOpen(record, true); return; }
    if (action === 'close-settings') { setSettingsOpen(record, false); return; }
    if (action === 'manage-stage') {
        if (!session || session.kind !== 'stage' || session.role !== 'host') return;
        void openStageManageModal(session.id);
        return;
    }
    if (action === 'chat') {
        panel.dataset.chatOpen = String(panel.dataset.chatOpen !== 'true');
        actionLabel(record, 'chat', session?.kind === 'stage' ? 'コメント' : 'チャット', panel.dataset.chatOpen === 'true');
        return;
    }
    if (action === 'minimize') { minimize(record); return; }
    const current = session;
    if (!current) return;
    if (action === 'join') {
        if (record.pending || current.joined) return;
        const button = panel.querySelector('[data-call-action="join"]');
        button.disabled = true;
        try {
            if (record.session !== current) return;
            await new Promise((resolve, reject) => {
                const id = `${Date.now()}-${++requestSequence}`;
                const timeout = setTimeout(() => { if (record.pending?.id === id) { record.pending = null; try { send(record, 'call:leave'); } catch (_) {} reject(new Error('参加できませんでした。再試行してください。')); } }, 10000);
                record.pending = { id, resolve: () => { clearTimeout(timeout); resolve(); }, reject: error => { clearTimeout(timeout); reject(error); } };
                try { send(record, 'call:join', { request_id: id, muted: !hasActiveMicrophone(current), camera: localTracks(current, 'video').some(track => track.readyState === 'live' && track.enabled) }); }
                catch (error) { record.pending.reject(error); record.pending = null; }
            });
        } finally { if (button.isConnected) button.disabled = false; }
    } else if (action === 'share' && current.joined && current.role !== 'audience') {
        if (current.screen) { stopSharing(record); return; }
        if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('画面共有に対応していません。');
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { max: 1920 },
                height: { max: 1080 },
                frameRate: { ideal: 15, max: 30 },
            },
            audio: false,
        });
        for (const track of stream.getVideoTracks()) track.contentHint = 'detail';
        if (record.session !== current || current.role === 'audience') { stream.getTracks().forEach(t => t.stop()); return; }
        current.screen = stream;
        const user = getCurrentUser();
        const screenLabel = `@${String(user?.handle || user?.nyaitter_id || user?.name || 'ユーザー').replace(/^@/, '')}のスクリーン`;
        try { send(record, 'call:screen', { active: true, stream_id: stream.id }); }
        catch (error) { current.screen = null; stream.getTracks().forEach(track => track.stop()); throw error; }
        current.screenShares.set(String(current.localUserId), { streamId: stream.id, label: screenLabel });
        const preview = document.createElement('div');
        preview.className = 'call-person-camera call-person-screen-share has-video';
        preview.dataset.localScreen = '';
        const video = document.createElement('video');
        video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
        const label = document.createElement('span');
        label.textContent = screenLabel;
        preview.append(video, label);
        preview.dataset.userId = String(current.localUserId);
        preview.dataset.panelId = `screen:${current.localUserId}`;
        preview.dataset.streamId = stream.id;
        current.screenPreview = preview;
        renderParticipants(panel, current.roster, current.kind, current.localUserId, current.screenShares, current.role === 'host', current.preferences);
        placeLocalTiles(record, current);
        applyPersonPreferences(record);
        for (const peer of current.peers.values()) for (const track of stream.getTracks()) addTrack(peer, track, stream);
        stream.getVideoTracks()[0].onended = () => stopSharing(record);
        actionLabel(record, 'share', '共有を停止', true);
    } else if (action === 'transcribe' && current.joined) {
        current.transcriptionEnabled = !current.transcriptionEnabled;
        if (current.transcriptionEnabled) startLocalTranscription(record, current);
        else {
            stopLocalTranscription(current);
            current.transcriptByUser.clear();
        }
        sendState(record);
        renderTranscripts(record, current);
        actionLabel(record, 'transcribe', current.transcriptionEnabled ? '文字起こしを非表示' : '文字起こしを表示', current.transcriptionEnabled);
    } else if (action === 'play') {
        await Promise.all([...panel.querySelectorAll('video')].map(video => video.play()));
    }
}

function closeRecord(record) {
    const session = record.session;
    closePersonTools(record);
    const wasJoining = Boolean(record.pending);
    if (record.pending) { record.pending.reject(new Error('参加を取り消しました。')); record.pending = null; }
    try { if (session && (session.joined || wasJoining || session.watching)) send(record, 'call:leave'); } catch (_) { /* 切断時も機器を解放する。 */ }
    if (session) {
        clearTimeout(session.localPreviewTimer);
        ++session.captureVersion;
        stopLocalTranscription(session);
        stopSharing(record);
        localTracks(session).forEach(track => track.stop());
        for (const id of [...session.peers.keys()]) closePeer(record, id);
    }
    calls.delete(record.key);
    record.window?.destroy(); record.window = null;
    record.panel?.remove(); record.panel = null;
    const wasGuest = session?.guest;
    const otherGuest = [...calls.values()].some(other => other.session?.guest);
    record.session = null;
    if (wasGuest && !otherGuest) {
        void request('/server/api/calls/stages/guest-session', { method: 'DELETE' }).catch(() => {});
        // 共有リアルタイム接続は他に開いている通話がある間は止めない。
        if (calls.size === 0) stopGuestRealtime();
    }
}

export function leaveCall(record) {
    if (!record) { for (const active of [...calls.values()]) closeRecord(active); return; }
    closeRecord(record);
}

export function callConnectionClosed() {
    if (!calls.size) return;
    for (const active of [...calls.values()]) closeRecord(active);
    void showAppAlert('接続が切れました。再接続してください。');
}

window.addEventListener('pagehide', () => leaveCall());
window.addEventListener('resize', () => { for (const record of calls.values()) positionPersonTools(record); });

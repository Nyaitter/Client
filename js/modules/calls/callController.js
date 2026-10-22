import { apiRequest } from '../../api.js';
import { getCurrentUser, getRealtimeChannel } from '../../state.js';
import { escapeHTML, formatNyaitterId, showAppAlert } from '../../utils/helpers.js';
import { connectGuestRealtime, stopGuestRealtime, waitForRealtimeOpen } from '../realtime.js';
import { openStageManageModal } from '../stageManage.js';
import { createCallMedia } from './callMedia.js';
import { createCallPeer, qualityProfile } from './callPeer.js';
import {
    appendChat,
    clearChatMessages,
    collectView,
    placeMedia,
    populateDeviceSelects,
    removeChatMessage,
    renderCallShell,
    renderRoster,
    renderTranscripts,
    roleName,
    setFeedback,
    setStatus,
    syncDeviceControls,
} from './callView.js';

let activeController = null;
let requestSequence = 0;

const localTracks = session => (session?.media?.local?.getTracks() || []);
const liveAudio = session => Boolean(session?.media?.audioEnabled);
const liveVideo = session => Boolean(session?.media?.videoEnabled);

function roomKey(kind, id) {
    return `${kind}:${id}`;
}

export function getActiveCallController() {
    return activeController;
}

export function setActiveCallController(controller) {
    activeController = controller;
}

export async function createCallController({ kind, id, container, context, requireActive = false }) {
    const controller = new CallController({ kind, id: String(id), container, context, requireActive });
    await controller.start();
    return controller;
}

class CallController {
    constructor({ kind, id, container, context, requireActive }) {
        this.kind = kind;
        this.id = id;
        this.key = roomKey(kind, id);
        this.container = container;
        this.context = context;
        this.requireActive = requireActive;
        this.abort = new AbortController();
        this.view = null;
        this.media = null;
        this.pending = null;
        this.destroyed = false;
        this.socket = null;
        this.joined = false;
        this.watching = false;
        this.role = 'member';
        this.roster = [];
        this.preferences = Object.create(null);
        this.peers = new Map();
        this.pendingSignals = new Map();
        this.streams = new Map();
        this.screenShares = new Map();
        this.quality = 'middle';
        this.transcriptionEnabled = false;
        this.recognition = null;
        this.transcriptByUser = new Map();
        this.guest = false;
        this.guestId = null;
        this.localUserId = null;
        this.ownerId = null;
        this.info = null;
        this.screenPreview = null;
        this.confirmLeave = false;
        this.activeMenu = null;
    }

    get signal() {
        return this.abort.signal;
    }

    async start() {
        if (activeController && activeController !== this) activeController.destroy();
        activeController = this;
        this.container.innerHTML = '<div class="call-loading"><div class="spinner" aria-label="読み込み中"></div></div>';
        this.context?.addCleanup(() => this.destroy());
        window.addEventListener('pagehide', () => this.destroy(), { signal: this.signal });
        try {
            await this.loadInfo();
        } catch (error) {
            if (this.destroyed) return;
            this.container.innerHTML = `<div class="call-error nui-empty-text"><p role="alert">${escapeHTML(error.message)}</p><a class="nui-button-secondary" href="${escapeHTML(this.backHash())}">戻る</a></div>`;
            throw error;
        }
        this.render();
        this.bindEvents();
        await this.attachMedia();
        await this.prepare();
    }

    async loadInfo() {
        const path = this.kind === 'stage'
            ? `/server/api/calls/stages/${encodeURIComponent(this.id)}`
            : `/server/api/calls/dm/${encodeURIComponent(this.id)}`;
        const { data, error } = await apiRequest(path, { signal: this.signal });
        if (error) throw new Error(this.kind === 'dm' && !getCurrentUser()
            ? '通話にはログインが必要です。'
            : error.message);
        this.info = data || {};
        if (this.requireActive && this.info.active === false) throw new Error('この通話は終了しました。');
        const user = getCurrentUser();
        if (!user && this.kind === 'stage') {
            const guest = await apiRequest(`/server/api/calls/stages/${encodeURIComponent(this.id)}/guest-session`, { method: 'POST', body: {}, signal: this.signal });
            if (guest.error) throw guest.error;
            this.guestId = guest.data?.guest_id || null;
            this.guest = true;
        }
        this.role = this.info.role || 'member';
        this.ownerId = this.info.stage?.owner_id ?? this.info.owner_id ?? null;
        this.localUserId = this.guestId || user?.id || 'guest';
    }

    render() {
        const user = getCurrentUser();
        const canPublish = this.canPublish();
        this.container.innerHTML = this.shell({ user, canPublish });
        this.view = collectView(this.container);
        this.setChatOpen(window.innerWidth >= 900);
        const ended = this.info?.stage?.status === 'ended';
        if (ended) setStatus(this.view, '終了しました');
        else if (this.info?.stage?.status === 'scheduled') setStatus(this.view, '開催前');
        else setStatus(this.view, '接続前');
    }

    shell({ user, canPublish }) {
        const info = { ...this.info, id: this.id, role: this.role };
        return renderCallShell({ kind: this.kind, info, user, canPublish, guest: this.guest });
    }

    async attachMedia() {
        this.media = createCallMedia({
            onChange: () => this.handleMediaChange(),
            onError: error => setFeedback(this.view, error.message),
        });
        if (this.view?.localVideo) {
            this.view.localVideo.srcObject = this.media.local;
            const refresh = () => this.updateMediaSurface();
            this.view.localVideo.addEventListener('loadedmetadata', refresh, { signal: this.signal });
            this.view.localVideo.addEventListener('loadeddata', refresh, { signal: this.signal });
            this.view.localVideo.addEventListener('playing', refresh, { signal: this.signal });
        }
        if (!this.canPublish()) {
            syncDeviceControls(this.view, this.media);
            return;
        }
        try {
            await this.media.ensure({ audio: true, video: true });
        } catch (error) {
            setFeedback(this.view, error.message);
        }
        syncDeviceControls(this.view, this.media);
        if (this.view?.localVideo && liveVideo({ media: this.media })) {
            this.view.localVideo.play().catch(() => {});
        }
        await populateDeviceSelects(this.view, this.media);
    }

    async prepare() {
        if (this.kind !== 'stage') return;
        const status = this.info?.stage?.status;
        if (status === 'ended') return;
        if (!getCurrentUser()) {
            await connectGuestRealtime().catch(error => setFeedback(this.view, error.message));
            if (this.destroyed) return;
            if (status === 'scheduled') await this.watch();
            else if (status === 'live') await this.join();
            return;
        }
        if (status === 'scheduled' && this.role === 'audience') {
            await this.watch();
        } else if (status === 'live' && this.role === 'audience') {
            await this.join();
        }
    }

    canPublish() {
        return !this.guest && this.role !== 'audience';
    }

    backHash() {
        return this.kind === 'stage'
            ? `#stage/${encodeURIComponent(this.id)}`
            : `#dm/${encodeURIComponent(this.id)}`;
    }

    send(type, data = {}) {
        const socket = this.socket || getRealtimeChannel();
        if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('接続が切れました。再接続してください。');
        socket.send(JSON.stringify({ type, kind: this.kind, id: this.id, ...data }));
    }

    async ensureRealtime() {
        if (this.guest) {
            await connectGuestRealtime();
        } else {
            await waitForRealtimeOpen();
        }
        this.socket = getRealtimeChannel();
    }

    bindEvents() {
        const root = this.view.root;
        const signal = this.signal;
        root.addEventListener('click', event => this.handleClick(event), { signal });
        root.addEventListener('change', event => this.handleChange(event), { signal });
        root.addEventListener('input', event => this.handleInput(event), { signal });
        root.addEventListener('submit', event => this.handleSubmit(event), { signal });
        root.addEventListener('contextmenu', event => this.handleContextMenu(event), { signal });
        root.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !this.view.settings.open) this.closeMenu();
        }, { signal });
        document.addEventListener('pointerdown', event => {
            if (!this.activeMenu) return;
            if (!event.target.closest('[data-call-menu-box]') && !event.target.closest('[data-call-menu]')) this.closeMenu();
        }, { signal });
        const settings = this.view.settings;
        settings?.addEventListener('click', event => {
            if (event.target === settings) this.closeSettings();
        }, { signal });
    }

    handleClick(event) {
        const menuAction = event.target.closest('[data-menu-action]');
        if (menuAction) {
            event.preventDefault();
            this.runMenuAction(menuAction.dataset.menuAction, menuAction.dataset.menuUser);
            return;
        }
        const menuButton = event.target.closest('[data-call-menu]');
        if (menuButton) {
            event.preventDefault();
            event.stopPropagation();
            const rect = menuButton.getBoundingClientRect();
            this.openMenu(menuButton.dataset.callMenu, rect.left, rect.bottom);
            return;
        }
        const button = event.target.closest('[data-call-action]');
        if (!button) return;
        event.preventDefault();
        const action = button.dataset.callAction;
        this.perform(action, button).catch(error => {
            setFeedback(this.view, error.message);
            if (action === 'join') button.disabled = false;
        });
    }

    async perform(action, button) {
        if (action === 'join') return this.join(button);
        if (action === 'leave' || action === 'cancel') return this.leave();
        if (action === 'toggle-audio') return this.toggleAudio();
        if (action === 'toggle-video') return this.toggleVideo();
        if (action === 'share') return this.toggleShare();
        if (action === 'transcribe') return this.toggleTranscription();
        if (action === 'toggle-chat') return this.setChatOpen(this.view.root.dataset.chatOpen !== 'true');
        if (action === 'delete-chat') {
            const messageId = button?.dataset.messageId;
            if (messageId) this.send('call:chat-delete', { message_id: messageId });
            return;
        }
        if (action === 'clear-chat') {
            if (this.role !== 'host') return;
            this.send('call:chat-clear', {});
            return;
        }
        if (action === 'settings') return this.openSettings();
        if (action === 'close-settings') return this.closeSettings();
        if (action === 'play') return this.playMedia();
        if (action === 'manage-stage') {
            if (this.role === 'host') await openStageManageModal(this.id);
        }
    }

    handleChange(event) {
        const select = event.target.closest('[data-call-device-select]');
        if (select) {
            this.changeDevice(select.dataset.callDeviceSelect, select.value).catch(error => {
                setFeedback(this.view, error.message);
                void populateDeviceSelects(this.view, this.media);
            });
            return;
        }
        if (event.target.matches('[data-call-quality]')) {
            this.applyQuality(['low', 'middle', 'high'][Number(event.target.value)] || 'middle');
        }
    }

    handleInput(event) {
        if (!event.target.matches('[data-call-quality]')) return;
        const label = this.view.qualityValue;
        if (label) label.textContent = qualityProfile(['low', 'middle', 'high'][Number(event.target.value)] || 'middle').label;
    }

    handleSubmit(event) {
        if (!event.target.matches('[data-call-chat-form]')) return;
        event.preventDefault();
        const input = event.target.elements.message;
        const text = String(input.value || '').trim();
        if (!text) return;
        try {
            this.send('call:chat', { text });
            input.value = '';
            setFeedback(this.view, '');
        } catch (error) {
            setFeedback(this.view, error.message);
        }
    }

    handleContextMenu(event) {
        const tile = event.target.closest('.call-tile[data-user-id], .call-listener[data-user-id]');
        if (!tile) return;
        const userId = tile.dataset.userId;
        if (String(userId) === String(this.localUserId)) return;
        event.preventDefault();
        this.openMenu(tile.dataset.panelId || userId, event.clientX, event.clientY);
    }

    async join(button = null) {
        if (this.pending || this.joined) return;
        if (button) button.disabled = true;
        await this.ensureRealtime();
        if (this.destroyed) return;
        if (this.canPublish()) {
            try { await this.media.ensure({ audio: true, video: true }); }
            catch (error) { setFeedback(this.view, error.message); }
        }
        const id = `${Date.now()}-${++requestSequence}`;
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.pending?.id !== id) return;
                this.pending = null;
                try { this.send('call:leave'); } catch (_) {}
                reject(new Error('参加できませんでした。再試行してください。'));
            }, 12000);
            this.pending = {
                id,
                resolve: () => { clearTimeout(timeout); resolve(); },
                reject: error => { clearTimeout(timeout); reject(error); },
            };
            try {
                this.send('call:join', {
                    request_id: id,
                    muted: !liveAudio({ media: this.media }),
                    camera: liveVideo({ media: this.media }),
                });
                setStatus(this.view, '参加しています…');
            } catch (error) {
                this.pending?.reject(error);
                this.pending = null;
            }
        }).finally(() => { if (button?.isConnected) button.disabled = false; });
    }

    async watch() {
        if (this.watching) return;
        await this.ensureRealtime();
        if (this.destroyed) return;
        try {
            this.send('call:watch');
            this.watching = true;
            this.view.waiting.hidden = false;
            this.view.prejoin.hidden = true;
            setStatus(this.view, '開始を待っています');
        } catch (error) {
            setFeedback(this.view, error.message);
        }
    }

    async leave() {
        this.destroy({ navigate: true });
    }

    async toggleAudio() {
        if (!this.canPublish()) return;
        if (this.forceMuted && !liveAudio({ media: this.media })) {
            setFeedback(this.view, 'ホストがマイクを停止しています。');
            return;
        }
        const next = !liveAudio({ media: this.media });
        const ok = await this.media.setAudioEnabled(next);
        if (!ok) {
            setFeedback(this.view, 'マイクを使用できません。');
            return;
        }
        setFeedback(this.view, '');
        this.syncState();
        this.syncTranscription();
        this.updateMediaSurface();
    }

    async toggleVideo() {
        if (!this.canPublish()) return;
        if (this.forceCameraOff && !liveVideo({ media: this.media })) {
            setFeedback(this.view, 'ホストがカメラを停止しています。');
            return;
        }
        const next = !liveVideo({ media: this.media });
        const ok = await this.media.setVideoEnabled(next);
        if (!ok) {
            setFeedback(this.view, 'カメラを使用できません。');
            return;
        }
        setFeedback(this.view, '');
        this.syncState();
        this.updateMediaSurface();
    }

    async changeDevice(kind, deviceId) {
        if (!this.canPublish()) return;
        try {
            await this.media.replaceDevice(kind, deviceId);
            setFeedback(this.view, '');
        } finally {
            await populateDeviceSelects(this.view, this.media, {
                audio: this.media.audio ? (this.view.root.querySelector('[data-call-device-select="audio"]')?.value || '') : '',
                video: this.media.video ? (this.view.root.querySelector('[data-call-device-select="video"]')?.value || '') : '',
            });
        }
    }

    async toggleShare() {
        if (!this.joined || !this.canPublish()) return;
        if (this.media.screen) {
            this.stopSharing();
            return;
        }
        const stream = await this.media.startScreenShare();
        if (this.destroyed || !this.media.screen) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        const screenTrack = stream.getVideoTracks()[0] || null;
        this.screenShares.set(String(this.localUserId), {
            streamId: stream.id,
            trackId: screenTrack?.id || null,
            label: this.screenLabel(),
        });
        for (const peer of this.peers.values()) {
            for (const track of stream.getVideoTracks()) peer.setScreenSending(track, stream).catch(() => {});
        }
        this.createLocalScreenPreview(stream);
        renderRoster(this.view, this);
        placeMedia(this.view, this, this.streams);
        this.updateShareButton(true);
        try { this.send('call:screen', { active: true, stream_id: stream.id, track_id: screenTrack?.id || null }); }
        catch (error) {
            this.stopSharing();
            throw error;
        }
    }

    stopSharing() {
        const stream = this.media.stopScreenShare();
        if (!stream) return;
        for (const peer of this.peers.values()) {
            void peer.setScreenSending(null).catch(() => {});
        }
        this.screenShares.delete(String(this.localUserId));
        this.screenPreview?.remove();
        this.screenPreview = null;
        try { this.send('call:screen', { active: false, stream_id: stream.id }); } catch (_) {}
        renderRoster(this.view, this);
        placeMedia(this.view, this, this.streams);
        this.updateShareButton(false);
    }

    createLocalScreenPreview(stream) {
        const preview = document.createElement('div');
        preview.className = 'call-media';
        preview.dataset.media = 'local-screen';
        preview.dataset.screen = 'true';
        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        preview.append(video);
        this.screenPreview = preview;
    }

    screenLabel() {
        const user = getCurrentUser();
        return `@${String(user?.handle || user?.nyaitter_id || user?.name || 'ユーザー').replace(/^@/, '')}の画面`;
    }

    updateShareButton(active) {
        const button = this.view.root.querySelector('[data-call-action="share"]');
        if (!button) return;
        button.setAttribute('aria-pressed', String(active));
        button.classList.toggle('is-active', active);
        const label = button.querySelector('span');
        if (label) label.textContent = active ? '共有停止' : '共有';
    }

    toggleTranscription() {
        this.transcriptionEnabled = !this.transcriptionEnabled;
        if (this.transcriptionEnabled) this.startTranscription();
        else {
            this.stopTranscription();
            this.transcriptByUser.clear();
        }
        const button = this.view.root.querySelector('[data-call-action="transcribe"]');
        button?.setAttribute('aria-pressed', String(this.transcriptionEnabled));
        button?.classList.toggle('is-active', this.transcriptionEnabled);
        renderTranscripts(this.view, this);
        if (this.joined) this.syncState();
    }

    syncTranscription() {
        if (this.transcriptionEnabled && liveAudio({ media: this.media }) && this.joined) this.startTranscription();
        else this.stopTranscription();
    }

    startTranscription() {
        if (!this.transcriptionEnabled || !this.joined || !this.canPublish() || this.recognition || !liveAudio({ media: this.media })) return;
        const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
        if (!Recognition) return;
        const recognition = new Recognition();
        recognition.lang = 'ja-JP';
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onresult = event => {
            if (this.destroyed || !this.transcriptionEnabled) return;
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                if (!event.results[i].isFinal) continue;
                try { this.send('call:transcript', { text: event.results[i][0].transcript.slice(0, 2000) }); }
                catch (_) {}
            }
        };
        recognition.onerror = () => {
            if (this.recognition !== recognition) return;
            this.recognition = null;
        };
        recognition.onend = () => {
            if (this.recognition !== recognition) return;
            this.recognition = null;
            if (!this.destroyed && this.transcriptionEnabled && liveAudio({ media: this.media })) {
                setTimeout(() => this.startTranscription(), 300);
            }
        };
        this.recognition = recognition;
        try { recognition.start(); } catch (_) { this.recognition = null; }
    }

    stopTranscription() {
        if (!this.recognition) return;
        const recognition = this.recognition;
        this.recognition = null;
        recognition.onend = null;
        recognition.onerror = null;
        try { recognition.stop(); } catch (_) {}
    }

    openSettings() {
        if (!this.view.settings) return;
        if (!this.view.settings.open) this.view.settings.showModal();
        const level = this.quality;
        if (this.view.quality) this.view.quality.value = String(['low', 'middle', 'high'].indexOf(level));
        if (this.view.qualityValue) this.view.qualityValue.textContent = qualityProfile(level).label;
        void populateDeviceSelects(this.view, this.media);
    }

    closeSettings() {
        if (this.view.settings?.open) this.view.settings.close();
    }

    applyQuality(level) {
        if (!qualityProfile(level)) return;
        this.quality = level;
        for (const peer of this.peers.values()) peer.tune();
        if (this.view.qualityValue) this.view.qualityValue.textContent = qualityProfile(level).label;
    }

    async playMedia() {
        await Promise.all([...this.view.root.querySelectorAll('video')].map(video => video.play().catch(() => {})));
        const button = this.view.root.querySelector('[data-call-action="play"]');
        if (button) button.hidden = true;
    }

    setChatOpen(open) {
        this.view.root.dataset.chatOpen = String(open);
        if (open) this.view.root.classList.remove('call-chat-unread');
        const button = this.view.root.querySelector('[data-call-action="toggle-chat"]');
        button?.setAttribute('aria-pressed', String(open));
        const close = this.view.chat?.querySelector('[data-call-action="toggle-chat"]');
        if (close) close.setAttribute('aria-label', open ? 'チャットを閉じる' : 'チャットを開く');
    }

    syncState() {
        if (!this.joined) return;
        try {
            this.send('call:state', {
                muted: !liveAudio({ media: this.media }),
                camera: liveVideo({ media: this.media }),
                transcription_enabled: this.transcriptionEnabled,
            });
        } catch (_) {}
    }

    handleMediaChange() {
        if (this.destroyed) return;
        syncDeviceControls(this.view, this.media);
        for (const peer of this.peers.values()) {
            peer.syncLocalTracks(localTracks(this), this.media?.local || null).catch(() => {});
            peer.setCameraSending(liveVideo({ media: this.media }), this.media.video).catch(() => {});
        }
        this.syncState();
        this.updateMediaSurface();
    }

    updateMediaSurface() {
        if (!this.view) return;
        const videoOn = Boolean(liveVideo({ media: this.media }));
        this.view.root.classList.toggle('call-camera-on', videoOn);
        this.view.localBadge.hidden = videoOn;
        if (this.joined) placeMedia(this.view, this, this.streams);
        else {
            this.view.localPlaceholder.hidden = videoOn;
            this.view.localVideo.style.opacity = videoOn ? '1' : '0';
        }
    }

    async handleEvent(event) {
        if (!event?.type?.startsWith('call:')) return false;
        if (this.destroyed) return true;
        if (event.room && event.room !== this.key) return true;
        if (event.type === 'call:error') {
            if (this.pending && event.request_id === this.pending.id) {
                const pending = this.pending;
                this.pending = null;
                pending.reject(new Error(event.message));
            } else {
                setFeedback(this.view, event.message || '通話の処理に失敗しました。');
            }
            return true;
        }
        if (event.type === 'call:joined') {
            if (this.pending && event.request_id !== this.pending.id) return true;
            this.joined = true;
            this.watching = false;
            this.role = event.role || this.role;
            this.ownerId = event.owner_id ?? this.ownerId;
            this.pending?.resolve();
            this.pending = null;
            this.view.prejoin.hidden = true;
            this.view.waiting.hidden = true;
            this.view.room.hidden = false;
            this.view.controls.hidden = false;
            this.setChatOpen(window.innerWidth >= 900);
            setStatus(this.view, roleName(this.role));
            this.applyRoster(event.roster || []);
            this.syncState();
            this.startTranscription();
            return true;
        }
        if (event.type === 'call:watching') {
            this.watching = true;
            this.view.prejoin.hidden = true;
            this.view.waiting.hidden = false;
            setStatus(this.view, '開始を待っています');
            return true;
        }
        if (event.type === 'call:roster') {
            this.applyRoster(event.roster || []);
            return true;
        }
        if (event.type === 'call:stage') {
            if (event.status === 'live') {
                this.view.waiting.hidden = true;
                setStatus(this.view, '開始しました');
                if (!this.joined) await this.join();
            } else if (event.status === 'ended') {
                this.destroy({ navigate: true, message: 'このステージは終了しました。' });
            }
            return true;
        }
        if (event.type === 'call:signal') {
            this.handleSignal(event);
            return true;
        }
        if (event.type === 'call:screen') {
            this.handleScreenShare(event);
            return true;
        }
        if (event.type === 'call:chat') {
            appendChat(this.view, event, {
                localUserId: this.localUserId,
                canModerate: this.role === 'host',
            });
            if (this.view.root.dataset.chatOpen !== 'true') this.view.root.classList.add('call-chat-unread');
            return true;
        }
        if (event.type === 'call:chat-delete') {
            removeChatMessage(this.view, event.id);
            return true;
        }
        if (event.type === 'call:chat-clear') {
            clearChatMessages(this.view);
            return true;
        }
        if (event.type === 'call:transcript') {
            this.appendTranscript(event);
            return true;
        }
        if (event.type === 'call:moderated') {
            this.handleModerated(event);
            return true;
        }
        if (event.type === 'call:kicked') {
            this.destroy({ navigate: true, message: event.message || 'ホストにより退出させられました。' });
            return true;
        }
        if (event.type === 'call:ended') {
            this.destroy({ navigate: true, message: event.message || '通話が終了しました。' });
            return true;
        }
        return true;
    }

    handleConnectionClosed() {
        if (this.destroyed) return;
        this.destroy({ navigate: true, message: '接続が切れました。再接続してください。' });
    }

    applyRoster(roster) {
        if (!this.joined || this.destroyed) return;
        const mine = roster.find(person => String(person.user_id) === String(this.localUserId));
        if (!mine) {
            this.destroy({ navigate: true, message: '通話から退出しました。' });
            return;
        }
        const previousRole = this.role;
        this.roster = roster;
        this.role = mine.role || this.role;
        this.ownerId = this.info?.stage?.owner_id ?? this.ownerId;
        this.forceMuted = Boolean(mine.force_muted);
        this.forceCameraOff = Boolean(mine.force_camera_off);
        if (previousRole !== this.role) this.handleRoleChange(previousRole);
        if (this.forceMuted) {
            this.media.setAudioEnabled(false).catch(() => {});
            this.stopTranscription();
        }
        if (this.forceCameraOff) {
            this.media.setVideoEnabled(false).catch(() => {});
        }
        this.syncScreenShares();
        renderRoster(this.view, this);
        placeMedia(this.view, this, this.streams);
        renderTranscripts(this.view, this);
        this.syncPeerTargets(previousRole);
        this.applyControlVisibility(mine);
        syncDeviceControls(this.view, this.media);
        setStatus(this.view, roleName(this.role));
        document.querySelectorAll('[data-call-count]').forEach(node => { node.textContent = `${roster.length}人`; });
    }

    handleRoleChange(previousRole) {
        if (this.role === 'audience') {
            this.media.setAudioEnabled(false).catch(() => {});
            this.media.setVideoEnabled(false).catch(() => {});
            this.stopSharing();
            this.stopTranscription();
            setFeedback(this.view, 'リスナーに切り替わりました。');
            for (const peer of this.peers.values()) {
                peer.setPublishEnabled(false).catch(() => {});
                peer.syncLocalTracks([], null).catch(() => {});
            }
        } else if (previousRole === 'audience') {
            setFeedback(this.view, 'スピーカーになりました。マイクとカメラをオンにできます。');
            for (const peer of this.peers.values()) {
                peer.setPublishEnabled(true).catch(() => {});
                peer.syncLocalTracks(localTracks(this), this.media?.local || null).catch(() => {});
                peer.setCameraSending(liveVideo({ media: this.media }), this.media.video).catch(() => {});
            }
        }
    }

    applyControlVisibility(mine) {
        const canPublish = this.canPublish();
        for (const action of ['toggle-audio', 'toggle-video', 'share', 'transcribe']) {
            for (const button of this.view.root.querySelectorAll(`[data-call-action="${action}"]`)) button.hidden = !canPublish;
        }
        const chatDisabled = Boolean(mine?.chat_disabled || this.guest);
        for (const element of this.view.root.querySelectorAll('[data-call-chat-form] input, [data-call-chat-form] button')) element.disabled = chatDisabled;
        if (this.view.root.querySelector('[data-call-settings-devices]')) {
            this.view.root.querySelector('[data-call-settings-devices]').hidden = !canPublish;
        }
        for (const devices of this.view.root.querySelectorAll('.call-devices')) devices.hidden = !canPublish;
    }

    syncPeerTargets(previousRole) {
        const canPublish = this.canPublish();
        const targetIds = new Set();
        for (const person of this.roster) {
            const id = String(person.user_id);
            if (id === String(this.localUserId)) continue;
            if (this.kind === 'stage') {
                if (this.role === 'host') targetIds.add(id);
                else if (String(person.user_id) === String(this.ownerId) || person.role === 'host') targetIds.add(id);
            } else {
                targetIds.add(id);
            }
        }
        for (const [id, peer] of [...this.peers]) {
            if (!targetIds.has(String(id)) || previousRole !== this.role) {
                peer.close();
                this.peers.delete(id);
                this.dropStreamsFor(id);
            }
        }
        for (const id of targetIds) {
            const peer = this.peers.get(id) || this.createPeer(id);
            if (!peer) continue;
            peer.setPublishEnabled(canPublish).catch(() => {});
            peer.syncLocalTracks(canPublish ? localTracks(this) : [], canPublish ? this.media?.local || null : null).catch(() => {});
            peer.setCameraSending(canPublish && liveVideo({ media: this.media }), this.media.video).catch(() => {});
            if (this.media.screen) {
                for (const track of this.media.screen.getVideoTracks()) {
                    peer.setScreenSending(track, this.media.screen).catch(() => {});
                }
            } else {
                peer.setScreenSending(null).catch(() => {});
            }
            const queued = this.pendingSignals.get(String(id));
            if (queued) {
                this.pendingSignals.delete(String(id));
                for (const data of queued) peer.handleSignal(data).catch(error => this.reportPeerError(error));
            }
        }
    }

    createPeer(id) {
        const comparison = String(this.localUserId).localeCompare(String(id));
        const peer = createCallPeer({
            id,
            polite: comparison > 0,
            initiator: comparison < 0,
            iceServers: this.info?.ice_servers || [],
            iceTransportPolicy: this.info?.ice_transport_policy || 'all',
            bundlePolicy: this.info?.bundle_policy || 'max-bundle',
            rtcpMuxPolicy: this.info?.rtcp_mux_policy || 'require',
            canPublish: this.canPublish(),
            quality: this.quality,
            sendSignal: (to, data) => {
                try { this.send('call:signal', { to, data }); }
                catch (_) {}
            },
            onTrack: event => this.handleRemoteTrack(id, event),
            onState: (state, error) => {
                if (state === 'failed') setStatus(this.view, '接続を再接続しています…');
                if (state === 'connected') setStatus(this.view, roleName(this.role));
                if (state === 'error' && error) this.reportPeerError(error);
            },
        });
        this.peers.set(String(id), peer);
        if (this.kind === 'stage' && this.role === 'host') {
            for (const remote of this.streams.values()) {
                if (String(remote.userId) === String(id)) continue;
                for (const track of remote.stream.getTracks()) {
                    void peer.forwardTrack(track, remote.stream).catch(() => {});
                }
            }
        }
        return peer;
    }

    reportPeerError(error) {
        console.warn('[call] peer error', error);
        setFeedback(this.view, '接続の一部に失敗しました。再接続しています。');
    }

    handleSignal(event) {
        const from = String(event.from);
        const peer = this.peers.get(from);
        if (peer) {
            peer.handleSignal(event.data || {}).catch(error => this.reportPeerError(error));
            return;
        }
        if (!this.roster.some(person => String(person.user_id) === from)) {
            const queued = this.pendingSignals.get(from) || [];
            queued.push(event.data || {});
            this.pendingSignals.set(from, queued);
            return;
        }
        const created = this.createPeer(from);
        created?.handleSignal(event.data || {}).catch(error => this.reportPeerError(error));
    }

    handleRemoteTrack(userId, event) {
        const track = event.track;
        const stream = event.streams[0] || new globalThis.MediaStream([track]);
        const key = `${userId}:${stream.id}`;
        const share = this.screenShares.get(String(userId));
        const screen = Boolean(
            (share?.streamId && share.streamId === stream.id)
            || (share?.trackId && share.trackId === track.id),
        );
        const existing = this.streams.get(key);
        if (existing) {
            if (!existing.trackIds.includes(track.id)) existing.trackIds.push(track.id);
            if (screen) existing.screen = true;
            return;
        }
        const element = document.createElement('div');
        element.className = 'call-media';
        element.dataset.media = `${userId}:${stream.id}`;
        element.dataset.streamId = stream.id;
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = stream;
        element.append(video);
        const remote = {
            stream,
            streamId: stream.id,
            userId: String(userId),
            screen,
            element,
            video,
            trackIds: [track.id],
        };
        this.streams.set(key, remote);
        const refresh = () => placeMedia(this.view, this, this.streams);
        video.addEventListener('loadedmetadata', refresh);
        video.addEventListener('loadeddata', refresh);
        video.addEventListener('playing', refresh);
        video.addEventListener('resize', refresh);
        track.addEventListener('unmute', refresh);
        track.addEventListener('mute', refresh);
        track.addEventListener('ended', () => {
            this.dropStream(key);
            for (const peer of this.peers.values()) {
                const sender = peer.pc.getSenders().find(item => item.track === track);
                if (sender) peer.pc.removeTrack(sender);
            }
        });
        video.play().catch(() => {
            const play = this.view.root.querySelector('[data-call-action="play"]');
            if (play) play.hidden = false;
            setStatus(this.view, '「音声」を押すと音が流れます');
        });
        placeMedia(this.view, this, this.streams);
        if (this.kind === 'stage' && this.role === 'host') {
            for (const peer of this.peers.values()) {
                if (String(peer.id) === String(userId)) continue;
                void peer.forwardTrack(track, stream).catch(() => {});
            }
        }
    }

    dropStream(key) {
        const remote = this.streams.get(key);
        if (!remote) return;
        remote.element.remove();
        this.streams.delete(key);
        placeMedia(this.view, this, this.streams);
    }

    dropStreamsFor(userId) {
        for (const [key, remote] of [...this.streams]) {
            if (String(remote.userId) === String(userId)) this.dropStream(key);
        }
    }

    syncScreenShares() {
        const present = new Set(this.roster.map(person => String(person.user_id)));
        for (const id of [...this.screenShares.keys()]) {
            if (!present.has(String(id)) && String(id) !== String(this.localUserId)) this.screenShares.delete(id);
        }
        for (const person of this.roster) {
            if (person.screen_stream_id) {
                this.screenShares.set(String(person.user_id), {
                    streamId: String(person.screen_stream_id),
                    trackId: person.screen_track_id ? String(person.screen_track_id) : null,
                    label: person.screen_label || '画面共有',
                });
            } else if (String(person.user_id) !== String(this.localUserId)) {
                this.screenShares.delete(String(person.user_id));
            }
        }
        this.refreshStreamScreens();
    }

    refreshStreamScreens() {
        for (const remote of this.streams.values()) {
            const share = this.screenShares.get(String(remote.userId));
            const byTrack = Boolean(share?.trackId && remote.trackIds?.includes(share.trackId));
            const byStream = Boolean(share?.streamId && remote.streamId === share.streamId);
            remote.screen = Boolean(share && (byTrack || byStream));
        }
    }

    handleScreenShare(event) {
        const userId = String(event.user_id);
        if (event.active && event.stream_id) {
            this.screenShares.set(userId, {
                streamId: String(event.stream_id),
                trackId: event.track_id ? String(event.track_id) : null,
                label: String(event.label || '画面'),
            });
        } else {
            this.screenShares.delete(userId);
            for (const [key, remote] of [...this.streams]) {
                if (String(remote.userId) === userId && remote.screen) this.dropStream(key);
            }
        }
        this.refreshStreamScreens();
        renderRoster(this.view, this);
        placeMedia(this.view, this, this.streams);
    }

    handleModerated(event) {
        const messages = {
            chat: 'チャットの状態が変更されました。',
            mute: event.value === false ? 'マイクの停止が解除されました。' : 'ホストによりマイクが停止されました。',
            camera: event.value === false ? 'カメラの停止が解除されました。' : 'ホストによりカメラが停止されました。',
            pin: 'パネルの固定状態が変更されました。',
            promote: 'スピーカーに昇格しました。',
            demote: 'リスナーに降格しました。',
        };
        if (event.action === 'mute' && event.value !== false) {
            this.media.setAudioEnabled(false).catch(() => {});
            this.stopTranscription();
        }
        if (event.action === 'camera' && event.value !== false) this.media.setVideoEnabled(false).catch(() => {});
        setFeedback(this.view, messages[event.action] || 'ホストにより設定が変更されました。');
    }

    appendTranscript(event) {
        if (!this.transcriptionEnabled) return;
        const key = String(event.user_id);
        const previous = this.transcriptByUser.get(key) || '';
        this.transcriptByUser.set(key, `${previous}${previous ? ' ' : ''}${String(event.text || '')}`.slice(-600));
        renderTranscripts(this.view, this);
    }

    openMenu(panelId, x, y) {
        const id = String(panelId);
        const screen = id.startsWith('screen:');
        const ownerId = screen ? id.slice(7) : id;
        const person = this.roster.find(item => String(item.user_id) === ownerId);
        const pref = this.preferences[ownerId] || {};
        const self = ownerId === String(this.localUserId);
        const entries = screen ? [] : [
            ['pref-mute', pref.muted ? 'この人の音声を戻す' : 'この人だけミュート'],
            ['pref-camera', pref.cameraHidden ? '映像を表示' : '映像を非表示'],
            ['pref-chat', pref.chatHidden ? 'チャットを表示' : 'チャットを非表示'],
            ['pref-pin', pref.pinned ? '固定を解除' : '固定表示'],
            ['pref-hide', pref.hidden ? '一覧に戻す' : '一覧から隠す'],
        ];
        if (this.role === 'host' && person && !self) {
            entries.push(['host-mute', person.force_muted ? 'マイク停止を解除' : 'マイクを強制停止']);
            entries.push(['host-camera', person.force_camera_off ? 'カメラ停止を解除' : 'カメラを強制停止']);
            entries.push(['host-chat', person.chat_disabled ? 'チャット停止を解除' : 'チャットを強制停止']);
            entries.push(['host-pin', person.force_pinned ? '固定を解除' : 'パネルを固定']);
            entries.push([person.role === 'audience' ? 'host-promote' : 'host-demote', person.role === 'audience' ? 'スピーカーに昇格' : 'リスナーに降格']);
            entries.push(['host-kick', 'セッションから追放']);
        }
        if (!entries.length) return;
        const box = this.view.menu;
        box.innerHTML = entries.map(([action, label]) => `<button type="button" role="menuitem" data-menu-action="${action}" data-menu-user="${escapeHTML(ownerId)}">${escapeHTML(label)}</button>`).join('');
        box.hidden = false;
        const width = box.offsetWidth;
        const height = box.offsetHeight;
        box.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
        box.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
        this.activeMenu = { panelId: id, ownerId };
    }

    closeMenu() {
        if (this.view?.menu) this.view.menu.hidden = true;
        this.activeMenu = null;
    }

    runMenuAction(action, ownerId) {
        const id = String(ownerId);
        this.closeMenu();
        if (action.startsWith('pref-')) {
            const pref = this.preferences[id] ||= {};
            if (action === 'pref-mute') pref.muted = !pref.muted;
            if (action === 'pref-camera') pref.cameraHidden = !pref.cameraHidden;
            if (action === 'pref-chat') pref.chatHidden = !pref.chatHidden;
            if (action === 'pref-pin') { pref.pinned = !pref.pinned; pref.hidden = false; }
            if (action === 'pref-hide') { pref.hidden = !pref.hidden; if (pref.hidden) pref.pinned = false; }
            this.applyPreferences();
            return;
        }
        if (!action.startsWith('host-')) return;
        const moderation = action.slice(5);
        if (moderation === 'kick' && !globalThis.confirm('このユーザーを追放しますか？ステージ終了まで再参加できません。')) return;
        try { this.send('call:moderate', { target: id, action: moderation }); }
        catch (error) { setFeedback(this.view, error.message); }
    }

    applyPreferences() {
        for (const [id, pref] of Object.entries(this.preferences)) {
            for (const video of this.view.root.querySelectorAll(`.call-tile[data-user-id="${CSS.escape(id)}"] video`)) {
                video.muted = Boolean(pref.muted);
                video.volume = Number.isFinite(pref.volume) ? pref.volume : 1;
            }
        }
        for (const message of this.view.messages.querySelectorAll('.call-message[data-user-id]')) {
            message.hidden = Boolean(this.preferences[String(message.dataset.userId)]?.chatHidden);
        }
        renderRoster(this.view, this);
        placeMedia(this.view, this, this.streams);
        renderTranscripts(this.view, this);
    }

    destroy({ navigate = false, message = null } = {}) {
        if (this.destroyed) return;
        this.destroyed = true;
        const wasJoined = this.joined || this.watching || Boolean(this.pending);
        this.pending?.reject(new Error('参加を取り消しました。'));
        this.pending = null;
        if (wasJoined) {
            try { this.send('call:leave'); } catch (_) {}
        }
        this.stopTranscription();
        this.stopSharingQuietly();
        this.media?.dispose();
        for (const peer of this.peers.values()) peer.close();
        this.peers.clear();
        this.streams.clear();
        this.abort.abort();
        if (this.container) this.container.innerHTML = '';
        if (activeController === this) activeController = null;
        if (this.guest) {
            void apiRequest('/server/api/calls/stages/guest-session', { method: 'DELETE' }).catch(() => {});
            if (!navigate) stopGuestRealtime();
        }
        if (navigate) {
            window.location.hash = this.backHash();
            if (message) setTimeout(() => { void showAppAlert(message); }, 0);
        }
    }

    stopSharingQuietly() {
        if (!this.media?.screen) return;
        const stream = this.media.screen;
        try { this.send('call:screen', { active: false, stream_id: stream.id }); } catch (_) {}
    }
}

const PROFILES = {
    low: { label: '低', audio: 32000, video: 500000, screen: 1000000, frameRate: 20 },
    middle: { label: '中', audio: 64000, video: 1500000, screen: 2500000, frameRate: 30 },
    high: { label: '高', audio: 96000, video: 3000000, screen: 4000000, frameRate: 30 },
};

export function qualityProfile(level) {
    return PROFILES[level] || PROFILES.middle;
}

export function tuneSender(sender, level) {
    const track = sender?.track;
    if (!track || typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') return;
    try {
        const parameters = sender.getParameters();
        if (!Array.isArray(parameters.encodings) || parameters.encodings.length === 0) parameters.encodings = [{}];
        const encoding = parameters.encodings[0];
        const profile = qualityProfile(level);
        if (track.kind === 'audio') {
            encoding.maxBitrate = profile.audio;
        } else {
            const screen = track.contentHint === 'detail' || track.contentHint === 'text';
            encoding.maxBitrate = screen ? profile.screen : profile.video;
            encoding.maxFramerate = screen ? Math.min(profile.frameRate, 15) : profile.frameRate;
            parameters.degradationPreference = screen ? 'maintain-resolution' : 'balanced';
        }
        encoding.networkPriority = 'high';
        const result = sender.setParameters(parameters);
        if (result?.catch) result.catch(() => {});
    } catch (_) {
        // 交渉前は encodings が空で失敗することがある。接続後に再適用する。
    }
}

const rtcSupported = () => typeof globalThis.RTCPeerConnection === 'function';

/**
 * 1対1の WebRTC 接続。
 *
 * 片方（initiator）だけが最初の offer を作る。もう片方は offer を受け取ってから
 * 同じトランシーバーへ自分のトラックを差し替える。これにより Firefox の rollback
 * でトランシーバーが重複する問題を避け、再接続後も m-line が増え続けない。
 */
export function createCallPeer({
    id,
    initiator = false,
    polite = false,
    iceServers = [],
    iceTransportPolicy = 'all',
    bundlePolicy = 'max-bundle',
    rtcpMuxPolicy = 'require',
    canPublish = true,
    sendSignal = () => {},
    onTrack = () => {},
    onState = () => {},
    quality = 'middle',
}) {
    if (!rtcSupported()) throw new Error('このブラウザでは通話を使えません。');
    const pc = new globalThis.RTCPeerConnection({
        iceServers,
        iceTransportPolicy,
        bundlePolicy,
        rtcpMuxPolicy,
    });
    let closed = false;
    let makingOffer = false;
    let negotiationQueued = false;
    let applyingRemote = false;
    let ignoreOffer = false;
    let restartTimer = null;
    let queuedCandidates = [];
    let publishEnabled = canPublish;
    let cameraOn = true;
    let localStream = null;
    let audioTrack = null;
    let videoTrack = null;
    let screenTrack = null;
    let audioTransceiver = null;
    let videoTransceiver = null;
    let screenTransceiver = null;

    const send = data => { if (!closed) sendSignal(String(id), data); };
    const tune = () => {
        for (const sender of pc.getSenders()) tuneSender(sender, quality);
    };

    function applyDirection(transceiver, enabled) {
        if (!transceiver) return;
        const direction = enabled ? 'sendrecv' : 'recvonly';
        if (transceiver.direction !== direction) transceiver.direction = direction;
    }

    function attachStream(sender, track, stream) {
        if (!track || !stream || !sender || sender.__callStream === stream) return;
        try {
            sender.setStreams(stream);
            sender.__callStream = stream;
        } catch (_) {
            // 未対応ブラウザでは msid なしで送信を続ける。
        }
    }

    function applyTracks() {
        applyDirection(audioTransceiver, publishEnabled);
        applyDirection(videoTransceiver, publishEnabled);
        applyDirection(screenTransceiver, publishEnabled);
        if (audioTransceiver) {
            attachStream(audioTransceiver.sender, audioTrack, localStream);
            audioTransceiver.sender.replaceTrack(publishEnabled ? audioTrack : null).catch(() => {});
        }
        if (videoTransceiver) {
            attachStream(videoTransceiver.sender, videoTrack, localStream);
            // カメラOFFでもトラックは外さない。enabled=false のまま送ることで
            // 受信側の msid / ストリーム構成が変わらず、再交渉も不要になる。
            videoTransceiver.sender.replaceTrack(publishEnabled ? videoTrack : null).catch(() => {});
        }
        if (screenTransceiver) {
            attachStream(screenTransceiver.sender, screenTrack, screenTransceiver.__callScreenStream || null);
            screenTransceiver.sender.replaceTrack(publishEnabled ? screenTrack : null).catch(() => {});
        }
        tune();
    }

    function ensureTransceivers() {
        if (!initiator) return;
        if (!audioTransceiver) {
            audioTransceiver = audioTrack
                ? pc.addTransceiver(audioTrack, { direction: 'sendrecv', streams: localStream ? [localStream] : undefined })
                : pc.addTransceiver('audio', { direction: 'sendrecv' });
            if (audioTrack) audioTransceiver.sender.__callStream = localStream;
        }
        if (!videoTransceiver) {
            videoTransceiver = videoTrack
                ? pc.addTransceiver(videoTrack, { direction: 'sendrecv', streams: localStream ? [localStream] : undefined })
                : pc.addTransceiver('video', { direction: 'sendrecv' });
            if (videoTrack) videoTransceiver.sender.__callStream = localStream;
        }
    }

    function attachTransceivers() {
        const all = pc.getTransceivers().filter(transceiver => !transceiver.stopped);
        if (!audioTransceiver) {
            audioTransceiver = all.find(transceiver => transceiver.receiver?.track?.kind === 'audio') || null;
        }
        const videos = all.filter(transceiver => transceiver.receiver?.track?.kind === 'video');
        if (!videoTransceiver) videoTransceiver = videos[0] || null;
        if (!screenTransceiver) screenTransceiver = videos[1] || null;
        applyTracks();
    }

    pc.onicecandidate = ({ candidate }) => {
        if (candidate) send({ candidate: candidate.toJSON() });
    };

    async function negotiate() {
        if (closed) return;
        if (applyingRemote || makingOffer || pc.signalingState !== 'stable') {
            negotiationQueued = true;
            return;
        }
        try {
            makingOffer = true;
            await pc.setLocalDescription();
            tune();
            if (pc.localDescription) send({ description: pc.localDescription.toJSON() });
        } catch (error) {
            if (!closed) onState('error', error);
        } finally {
            makingOffer = false;
            if (negotiationQueued && !closed && !applyingRemote && pc.signalingState === 'stable') {
                negotiationQueued = false;
                queueMicrotask(() => { if (!closed) negotiate(); });
            }
        }
    }

    pc.onnegotiationneeded = () => { void negotiate(); };

    pc.ontrack = event => {
        if (closed) return;
        if (event.track.kind === 'audio' && event.receiver && 'jitterBufferTarget' in event.receiver) {
            try { event.receiver.jitterBufferTarget = 40; } catch (_) {}
        }
        onTrack(event);
    };

    pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
            clearTimeout(restartTimer);
            restartTimer = null;
            tune();
            onState('connected');
        } else if (state === 'failed') {
            onState('failed');
            if (!restartTimer) {
                restartTimer = setTimeout(() => {
                    restartTimer = null;
                    if (closed || pc.connectionState !== 'failed') return;
                    try { pc.restartIce(); } catch (_) {}
                }, 1500);
            }
        } else if (state === 'disconnected') {
            onState('disconnected');
        }
    };

    async function handleSignal({ description, candidate }) {
        if (closed) return;
        if (description) {
            const collision = description.type === 'offer'
                && (makingOffer || pc.signalingState !== 'stable');
            if (collision) {
                ignoreOffer = !polite;
                if (ignoreOffer) return;
                // 初回交渉は initiator だけが開始するため、ここに来るのは
                // 再接続や転送トラック追加の競合時だけ。mid 確定後なら安全。
                await pc.setLocalDescription({ type: 'rollback' });
            } else {
                ignoreOffer = false;
            }
            if (description.type === 'offer') {
                // onnegotiationneeded が answer 作成中に余計な offer を出さないよう抑止する。
                applyingRemote = true;
                try {
                    await pc.setRemoteDescription(description);
                    attachTransceivers();
                    await pc.setLocalDescription();
                    tune();
                    if (pc.localDescription) send({ description: pc.localDescription.toJSON() });
                } finally {
                    applyingRemote = false;
                    negotiationQueued = false;
                }
            } else {
                await pc.setRemoteDescription(description);
            }
            for (const queued of queuedCandidates.splice(0)) {
                await pc.addIceCandidate(queued).catch(() => {});
            }
        } else if (candidate) {
            if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {});
            else queuedCandidates.push(candidate);
        }
    }

    async function syncLocalTracks(tracks, stream = null) {
        audioTrack = tracks.find(track => track.kind === 'audio') || null;
        videoTrack = tracks.find(track => track.kind === 'video') || null;
        if (stream) localStream = stream;
        ensureTransceivers();
        attachTransceivers();
        applyTracks();
    }

    async function setPublishEnabled(enabled) {
        publishEnabled = Boolean(enabled);
        ensureTransceivers();
        attachTransceivers();
        applyTracks();
    }

    async function setCameraSending(enabled, track = null) {
        cameraOn = Boolean(enabled);
        if (track) videoTrack = track;
        ensureTransceivers();
        attachTransceivers();
        applyTracks();
    }

    async function setScreenSending(track, screenStream = null) {
        screenTrack = track || null;
        if (screenTrack && !screenTransceiver) {
            screenTransceiver = pc.addTransceiver(screenTrack, {
                direction: 'sendrecv',
                streams: screenStream ? [screenStream] : undefined,
            });
            screenTransceiver.__callScreenStream = screenStream || null;
            screenTransceiver.sender.__callStream = screenStream || null;
            applyTracks();
            return;
        }
        attachTransceivers();
        if (screenTransceiver && screenStream) {
            screenTransceiver.__callScreenStream = screenStream;
            attachStream(screenTransceiver.sender, screenTrack, screenStream);
        }
        applyTracks();
    }

    async function forwardTrack(track, stream) {
        if (!track || !stream) return null;
        if (pc.getSenders().some(sender => sender.track === track)) return null;
        const transceiver = pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] });
        tune();
        return transceiver;
    }

    function close() {
        if (closed) return;
        closed = true;
        clearTimeout(restartTimer);
        pc.onnegotiationneeded = null;
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        try { pc.close(); } catch (_) {}
    }

    return {
        id: String(id),
        pc,
        initiator,
        get closed() { return closed; },
        handleSignal,
        syncLocalTracks,
        setPublishEnabled,
        setCameraSending,
        setScreenSending,
        forwardTrack,
        tune,
        close,
    };
}

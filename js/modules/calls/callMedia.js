const videoConstraints = (deviceId = '') => ({
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
});

const hasMediaDevices = () => typeof navigator.mediaDevices?.getUserMedia === 'function'
    && typeof globalThis.MediaStream === 'function';

export function createCallMedia({ onChange = () => {}, onError = () => {} } = {}) {
    const local = typeof globalThis.MediaStream === 'function' ? new globalThis.MediaStream() : null;
    const listeners = new AbortController();
    let audio = null;
    let video = null;
    let screen = null;
    let generation = 0;
    let audioDeviceId = '';
    let videoDeviceId = '';
    let audioOn = false;
    let videoOn = false;

    const live = track => Boolean(track && track.readyState === 'live');
    const notify = () => onChange({ audio, video, screen, audioOn, videoOn });
    const report = error => onError(error instanceof Error ? error : new Error(String(error)));

    function watchTrack(track) {
        track.addEventListener('ended', () => {
            if (track === audio) { audio = null; audioOn = false; }
            if (track === video) { video = null; videoOn = false; }
            if (track === screen) screen = null;
            notify();
        }, { signal: listeners.signal });
        track.addEventListener('mute', notify, { signal: listeners.signal });
        track.addEventListener('unmute', notify, { signal: listeners.signal });
    }

    function addTrack(track) {
        watchTrack(track);
        local?.addTrack(track);
        if (track.kind === 'audio') audio = track;
        if (track.kind === 'video') video = track;
    }

    async function request(constraints) {
        return navigator.mediaDevices.getUserMedia(constraints);
    }

    async function ensure({ audio: wantAudio = false, video: wantVideo = false } = {}) {
        if (!hasMediaDevices()) throw new Error('このブラウザではマイクやカメラを使えません。');
        const needsAudio = wantAudio && !live(audio);
        const needsVideo = wantVideo && !live(video);
        if (!needsAudio && !needsVideo) return;
        const version = ++generation;
        const constraints = {
            audio: needsAudio ? (audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true) : false,
            video: needsVideo ? videoConstraints(videoDeviceId) : false,
        };
        let stream;
        try {
            stream = await request(constraints);
        } catch (error) {
            if (!(needsAudio && needsVideo)) throw error;
            stream = await request({ audio: constraints.audio, video: false }).catch(() => null);
            if (!stream) throw error;
            report(new Error('カメラを使用できないため、マイクだけで続行します。'));
        }
        if (version !== generation) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        for (const track of stream.getTracks()) {
            if (track.kind === 'audio' && needsAudio) {
                track.contentHint = 'speech';
                addTrack(track);
                audioOn = true;
            } else if (track.kind === 'video' && needsVideo) {
                track.contentHint = 'motion';
                addTrack(track);
                videoOn = true;
            } else {
                track.stop();
            }
        }
        notify();
    }

    async function listDevices() {
        if (typeof navigator.mediaDevices?.enumerateDevices !== 'function') return [];
        try { return await navigator.mediaDevices.enumerateDevices(); }
        catch (_) { return []; }
    }

    async function setAudioEnabled(enabled) {
        if (enabled && !live(audio)) await ensure({ audio: true });
        if (!live(audio)) return false;
        audio.enabled = Boolean(enabled);
        audioOn = Boolean(enabled);
        notify();
        return true;
    }

    async function setVideoEnabled(enabled) {
        if (enabled && !live(video)) await ensure({ video: true });
        if (!live(video)) return false;
        video.enabled = Boolean(enabled);
        videoOn = Boolean(enabled);
        notify();
        return true;
    }

    async function replaceDevice(kind, deviceId) {
        if (!hasMediaDevices()) throw new Error('このブラウザでは機器を変更できません。');
        const isAudio = kind === 'audio';
        const previous = isAudio ? audio : video;
        const constraints = isAudio
            ? { audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false }
            : { audio: false, video: videoConstraints(deviceId) };
        const stream = await request(constraints);
        const next = stream.getTracks().find(track => track.kind === kind);
        if (!next) {
            stream.getTracks().forEach(track => track.stop());
            throw new Error('選択した機器を使用できませんでした。');
        }
        next.contentHint = isAudio ? 'speech' : 'motion';
        next.enabled = isAudio ? audioOn : videoOn;
        watchTrack(next);
        if (local) {
            if (previous) local.removeTrack(previous);
            local.addTrack(next);
        }
        previous?.stop();
        if (isAudio) { audio = next; audioDeviceId = deviceId || ''; }
        else { video = next; videoDeviceId = deviceId || ''; }
        notify();
        return { previous, next, stream };
    }

    async function startScreenShare() {
        if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
            throw new Error('このブラウザでは画面共有を使えません。');
        }
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { ideal: 15, max: 30 } },
            audio: false,
        });
        screen = stream;
        for (const track of stream.getVideoTracks()) {
            track.contentHint = 'detail';
            track.addEventListener('ended', () => { if (screen === stream) stopScreenShare(); }, { signal: listeners.signal });
        }
        notify();
        return stream;
    }

    function stopScreenShare() {
        const stream = screen;
        screen = null;
        stream?.getTracks().forEach(track => track.stop());
        notify();
        return stream;
    }

    function stop() {
        generation += 1;
        listeners.abort();
        local?.getTracks().forEach(track => track.stop());
        screen?.getTracks().forEach(track => track.stop());
        audio = null;
        video = null;
        screen = null;
        audioOn = false;
        videoOn = false;
    }

    const onDeviceChange = () => { notify(); };
    if (navigator.mediaDevices?.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    }

    return {
        local,
        get audio() { return audio; },
        get video() { return video; },
        get screen() { return screen; },
        get audioEnabled() { return Boolean(live(audio) && audio.enabled); },
        get videoEnabled() { return Boolean(live(video) && video.enabled); },
        get supported() { return hasMediaDevices(); },
        ensure,
        listDevices,
        setAudioEnabled,
        setVideoEnabled,
        replaceDevice,
        startScreenShare,
        stopScreenShare,
        stop,
        dispose() {
            stop();
            navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
        },
    };
}

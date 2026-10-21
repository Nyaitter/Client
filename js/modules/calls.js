import {
    createCallController,
    getActiveCallController,
} from './calls/callController.js';

const pendingOptions = new Map();
const callHash = (kind, id) => `#call/${kind === 'stage' ? 'stage' : 'dm'}/${encodeURIComponent(String(id))}`;

export async function openCall(kind, id, options = {}) {
    if (kind !== 'stage' && kind !== 'dm') throw new Error('通話の種類が正しくありません。');
    if (id === undefined || id === null || id === '') throw new Error('通話IDが正しくありません。');
    const key = `${kind}:${id}`;
    if (options.requireActive) pendingOptions.set(key, { requireActive: true });
    const hash = callHash(kind, id);
    if (window.location.hash === hash) return;
    window.location.hash = hash;
}

export async function mountCallScreen(kind, id, container, context) {
    const key = `${kind}:${id}`;
    const options = pendingOptions.get(key) || {};
    pendingOptions.delete(key);
    return createCallController({
        kind,
        id,
        container,
        context,
        requireActive: Boolean(options.requireActive),
    });
}

export function handleCallEvent(event) {
    const controller = getActiveCallController();
    if (controller) {
        void controller.handleEvent(event);
        return true;
    }
    return Boolean(event?.type?.startsWith('call:'));
}

export function leaveCall() {
    getActiveCallController()?.destroy();
}

export function callConnectionClosed() {
    getActiveCallController()?.handleConnectionClosed();
}

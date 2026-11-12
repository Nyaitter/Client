import {
    openCall as openCallCore,
    handleCallEvent,
    leaveCall,
    callConnectionClosed,
} from './callsCore.js';

// The original call panel implementation lives in callsCore.js unchanged from
// the first window UI. This wrapper keeps the tab route contract while letting
// the original markup and logic render inside #call-content.
export { handleCallEvent, leaveCall, callConnectionClosed };

const callHash = (kind, id) => `#call/${kind === 'stage' ? 'stage' : 'dm'}/${encodeURIComponent(String(id))}`;
let mountedKey = null;

export async function openCall(kind, id, options = {}) {
    if (kind !== 'stage' && kind !== 'dm') throw new Error('通話の種類が正しくありません。');
    if (id === undefined || id === null || id === '') throw new Error('通話IDが正しくありません。');
    const hash = callHash(kind, id);
    if (window.location.hash !== hash) {
        window.location.hash = hash;
        return;
    }
    // Already on this call route; make sure the original core mounted it.
    await openCallCore(kind, id, options);
}

export async function mountCallScreen(kind, id, container, context) {
    const key = `${kind}:${id}`;
    mountedKey = key;
    const cleanup = () => {
        if (mountedKey !== key) return;
        mountedKey = null;
        leaveCall();
    };
    context?.signal?.addEventListener('abort', cleanup, { once: true });
    await openCallCore(kind, id, {});
}

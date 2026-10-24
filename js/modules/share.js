import { copyTextToClipboard } from '../utils/helpers.js';

const kindPath = { group: 'groups', stage: 'stages' };

function shareBase() {
    const configured =
        globalThis.NyaitterClientConfig?.shareUrl ||
        globalThis.NyaitterClientConfig?.postShareUrl;
    if (configured) {
        const clean = String(configured).trim().replace(/#.*$/, '').replace(/\/+$/, '');
        if (clean) return clean;
    }
    const basePath = new URL('.', document.baseURI).pathname.replace(/\/+$/, '');
    return `${window.location.origin}${basePath}`;
}

export function entityShareUrl(kind, id) {
    const path = kindPath[kind];
    if (!path) throw new Error('共有URLを作成できません。');
    return `${shareBase()}/${path}/${encodeURIComponent(String(id))}`;
}

export async function copyEntityUrl(kind, id, button = null) {
    const url = entityShareUrl(kind, id);
    await copyTextToClipboard(url);
    if (button) {
        const label = button.querySelector('span');
        const previous = label ? label.textContent : button.textContent;
        if (label) label.textContent = 'コピーしました';
        else button.textContent = 'コピーしました';
        setTimeout(() => {
            if (!button.isConnected) return;
            if (label) label.textContent = previous;
            else button.textContent = previous;
        }, 1800);
    }
    return url;
}

import { t } from './i18n.js';
import { copyTextToClipboard, showToast } from '../utils/helpers.js';

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
    if (!path) throw new Error(t('share.url_failed'));
    return `${shareBase()}/${path}/${encodeURIComponent(String(id))}`;
}

export async function copyEntityUrl(kind, id) {
    const url = entityShareUrl(kind, id);
    await copyTextToClipboard(url);
    showToast(t('share.copied'));
    return url;
}

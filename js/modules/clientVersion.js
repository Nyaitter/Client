import { createNapPage } from '../../nap_modules/nyaitter/nap/client/nap-page.js';

const UPDATE_TIMEOUT_MS = 15000;
const RELOAD_DELAY_MS = 400;
let bound = false;
let loadInFlight = null;
let napPage = null;
let switching = false;

function serviceWorkerApiAvailable() {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !!navigator.serviceWorker;
}

async function isClientUpdateSupported() {
    if (!serviceWorkerApiAvailable()) return false;
    if (navigator.serviceWorker.controller) return true;
    try {
        return !!(await navigator.serviceWorker.getRegistration());
    } catch (_) {
        return false;
    }
}

function getNapPage() {
    if (napPage) return napPage;
    const source = String(globalThis.NyaitterClientConfig?.clientNap || '').trim();
    if (!source) return null;
    napPage = createNapPage({ source });
    return napPage;
}

function askServiceWorker(message, timeoutMs = 8000) {
    return new Promise((resolve) => {
        const controller = navigator.serviceWorker?.controller;
        if (!controller) {
            resolve(null);
            return;
        }
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(null), timeoutMs);
        channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            resolve(event.data || null);
        };
        try {
            controller.postMessage(message, [channel.port2]);
        } catch (_) {
            clearTimeout(timer);
            resolve(null);
        }
    });
}

async function getCurrentVersionId() {
    const page = getNapPage();
    if (!page || typeof caches === 'undefined') return '';
    try {
        const prefix = page.cacheName('');
        const keys = await caches.keys();
        const name = keys.find((key) => key.startsWith(prefix));
        return name ? name.slice(prefix.length) : '';
    } catch (_) {
        return '';
    }
}

async function clearNapVersionCaches() {
    const page = getNapPage();
    if (!page || typeof caches === 'undefined') return;
    try {
        const prefix = page.cacheName('');
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith(prefix)).map((key) => caches.delete(key)));
    } catch (_) {}
}

function setStatus(text) {
    const element = document.getElementById('settings-client-status');
    if (element) element.textContent = text || '';
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function buildVersionRow({ versionId, title, sub, label, server, description, date, current, disabled, onSelect }) {
    const item = document.createElement('li');
    item.className = 'settings-client-version-row nui-list-item' + (current ? ' settings-client-version-row--current' : '');
    item.setAttribute('data-nui', 'list-item');
    item.dataset.versionId = versionId || '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-client-version-select';
    button.disabled = !!disabled;
    const body = document.createElement('span');
    body.className = 'settings-client-version-body';
    const main = document.createElement('span');
    main.className = 'settings-client-version-main';
    const titleElement = document.createElement('span');
    titleElement.className = 'settings-client-version-code';
    titleElement.textContent = title;
    main.appendChild(titleElement);
    if (sub) {
        const subElement = document.createElement('span');
        subElement.className = 'settings-client-version-id';
        subElement.textContent = sub;
        main.appendChild(subElement);
    }
    body.appendChild(main);
    if (description) {
        const descriptionElement = document.createElement('span');
        descriptionElement.className = 'settings-client-version-description';
        descriptionElement.textContent = description;
        body.appendChild(descriptionElement);
    }
    button.appendChild(body);
    const side = document.createElement('span');
    side.className = 'settings-client-version-side';
    if (label) {
        const chip = document.createElement('span');
        chip.className = 'settings-client-version-label';
        chip.textContent = label;
        side.appendChild(chip);
    }
    if (server) {
        const chip = document.createElement('span');
        chip.className = 'settings-client-version-label';
        chip.textContent = 'サーバーの版';
        side.appendChild(chip);
    }
    if (date) {
        const dateElement = document.createElement('span');
        dateElement.className = 'settings-client-version-date';
        dateElement.textContent = date;
        side.appendChild(dateElement);
    }
    if (current) {
        const marker = document.createElement('span');
        marker.className = 'settings-client-version-current';
        marker.textContent = '使用中';
        side.appendChild(marker);
    }
    button.appendChild(side);
    if (onSelect) button.addEventListener('click', onSelect);
    item.appendChild(button);
    return item;
}

async function switchToVersion(entry) {
    if (switching) return;
    switching = true;
    const page = getNapPage();
    const list = document.getElementById('settings-client-versions');
    if (list) {
        list.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    }
    let row = null;
    if (entry && list) {
        row = [...list.children].find((item) => item.dataset.versionId === entry.id) || null;
    }
    try {
        if (!entry) {
            await clearNapVersionCaches();
            await askServiceWorker({ type: 'nyaitter:client-update' }, UPDATE_TIMEOUT_MS);
            setStatus('サーバーの版に切り替えました。再読み込みします…');
        } else {
            setStatus('ダウンロードしています…');
            if (row) {
                row.classList.add('settings-client-version-row--downloading');
                row.style.setProperty('--version-progress', '0%');
            }
            const ref = entry.tag ? `${entry.id}-${entry.tag}` : entry.id;
            let lastSizeLabel = '';
            const version = await page.fetchVersion(ref, {
                onProgress: (progress) => {
                    if (!row) return;
                    if (progress.phase === 'unpack') {
                        setStatus('展開しています…');
                        if (progress.total) {
                            const percent = Math.min(100, Math.round((progress.fetched / progress.total) * 100));
                            row.style.setProperty('--version-progress', `${percent}%`);
                        }
                        return;
                    }
                    if (progress.bytesTotal) {
                        setStatus('ダウンロードしています…');
                        const percent = Math.min(100, Math.round((progress.bytes / progress.bytesTotal) * 100));
                        row.style.setProperty('--version-progress', `${percent}%`);
                    } else if (progress.bytes) {
                        const sizeLabel = `${(progress.bytes / 1048576).toFixed(1)} MB`;
                        if (sizeLabel !== lastSizeLabel) {
                            lastSizeLabel = sizeLabel;
                            setStatus(`ダウンロードしています… ${sizeLabel}`);
                        }
                    } else if (progress.total) {
                        setStatus('ダウンロードしています…');
                        const percent = Math.min(100, Math.round(((progress.fetched + progress.cached) / progress.total) * 100));
                        row.style.setProperty('--version-progress', `${percent}%`);
                    }
                },
            });
            if (row) row.style.setProperty('--version-progress', '100%');
            setStatus('保存しています…');
            await page.store(version);
            await page.activate(version.versionId);
            setStatus('切り替えました。再読み込みします…');
        }
        window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    } catch (_) {
        switching = false;
        setStatus('切り替えできませんでした。通信状態を確認して、もう一度お試しください。');
        void loadClientVersionList();
    }
}

async function runLoad({ announce = false } = {}) {
    const list = document.getElementById('settings-client-versions');
    if (!list) return;
    const page = getNapPage();
    if (!page) {
        setStatus('クライアントの配布元が設定されていません。');
        return;
    }
    if (announce) setStatus('更新を確認しています…');
    let entries = [];
    try {
        entries = await page.versions();
    } catch (_) {
        setStatus('サーバーに接続できませんでした。オフラインの可能性があります。');
        return;
    }
    const supported = await isClientUpdateSupported();
    const currentId = await getCurrentVersionId();
    const descriptions = new Map();
    if (typeof page.describe === 'function') {
        await Promise.all(entries.map(async (entry) => {
            const ref = entry.tag ? `${entry.id}-${entry.tag}` : entry.id;
            const text = await page.describe(ref);
            if (text) descriptions.set(entry.id, text);
        }));
    }
    const formal = entries.filter((entry) => !entry.tag);
    const serverEntry = formal.length ? formal[formal.length - 1] : null;
    list.textContent = '';
    const ordered = [...entries].reverse();
    for (const entry of ordered) {
        const isServer = !!serverEntry && entry.id === serverEntry.id;
        const isCurrent = currentId ? entry.id === currentId : isServer;
        list.appendChild(buildVersionRow({
            versionId: entry.id,
            title: entry.code || entry.id.slice(0, 12),
            sub: entry.code ? entry.id.slice(0, 12) : '',
            label: entry.tag || '',
            server: isServer,
            description: descriptions.get(entry.id) || '',
            date: formatDate(entry.at),
            current: isCurrent,
            disabled: !supported || switching || isCurrent,
            onSelect: isServer ? () => void switchToVersion(null) : () => void switchToVersion(entry),
        }));
    }
    if (!supported) {
        setStatus('この環境ではクライアントの更新に対応していません。');
    } else if (announce) {
        setStatus('');
    }
}

function loadClientVersionList(options) {
    if (loadInFlight) return loadInFlight;
    loadInFlight = runLoad(options).finally(() => {
        loadInFlight = null;
    });
    return loadInFlight;
}

export function bindClientSettings() {
    if (bound) return;
    bound = true;
    document.getElementById('settings-client-check')?.addEventListener('click', () => {
        void loadClientVersionList({ announce: true });
    });
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
        void loadClientVersionList();
    });
}

export async function loadClientSettings() {
    bindClientSettings();
    await globalThis.NyaitterClientConfig?.ready;
    await loadClientVersionList();
}

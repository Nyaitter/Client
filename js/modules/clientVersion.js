import { t } from './i18n.js';
import { createNapPage } from '../../nap_modules/nyaitter/nap/client/nap-page.js';

const RELOAD_DELAY_MS = 400;
const PAGE_SIZE = 20;
let bound = false;
let loadInFlight = null;
let napPage = null;
let switching = false;
let listView = null;

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

function setStatus(text) {
    const element = document.getElementById('settings-client-status');
    if (element) element.textContent = text || '';
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function buildVersionRow({ versionId, title, sub, label, latest, description, date, current, disabled, onSelect }) {
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
    if (latest) {
        const chip = document.createElement('span');
        chip.className = 'settings-client-version-label';
        chip.textContent = t('settings.client.latest_version');
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
        marker.textContent = t('settings.client.in_use');
        side.appendChild(marker);
    }
    button.appendChild(side);
    if (onSelect) button.addEventListener('click', onSelect);
    item.appendChild(button);
    return item;
}

async function switchToVersion(entry) {
    if (switching || !entry) return;
    switching = true;
    const page = getNapPage();
    const list = document.getElementById('settings-client-versions');
    if (list) {
        list.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    }
    let row = null;
    if (list) {
        row = [...list.children].find((item) => item.dataset.versionId === entry.id) || null;
    }
    try {
        setStatus(t('settings.client.downloading'));
        if (row) {
            row.classList.add('settings-client-version-row--downloading');
            row.style.setProperty('--version-progress', '0%');
        }
        const ref = entry.tag ? `${entry.id}-${entry.tag}` : entry.id;
        const PHASE_COUNT = 3;
        let phaseIndex = 0;
        const setOverallProgress = (fraction) => {
            if (!row) return;
            const clamped = Math.min(1, Math.max(0, fraction || 0));
            const percent = Math.min(100, Math.round(((phaseIndex + clamped) / PHASE_COUNT) * 100));
            row.style.setProperty('--version-progress', `${percent}%`);
        };
        let lastSizeLabel = '';
        const version = await page.fetchVersion(ref, {
            onProgress: (progress) => {
                if (progress.phase === 'unpack') {
                    phaseIndex = 1;
                    setStatus(t('settings.client.unpacking'));
                    setOverallProgress(progress.total ? progress.fetched / progress.total : 0);
                    return;
                }
                phaseIndex = 0;
                if (progress.bytesTotal) {
                    const label = `${(progress.bytes / 1048576).toFixed(1)} MB / ${(progress.bytesTotal / 1048576).toFixed(1)} MB`;
                    if (label !== lastSizeLabel) {
                        lastSizeLabel = label;
                        setStatus(t('settings.client.downloading_size', { size: label }));
                    }
                    setOverallProgress(progress.bytes / progress.bytesTotal);
                } else if (progress.bytes) {
                    const label = `${(progress.bytes / 1048576).toFixed(1)} MB`;
                    if (label !== lastSizeLabel) {
                        lastSizeLabel = label;
                        setStatus(t('settings.client.downloading_size', { size: label }));
                    }
                } else if (progress.total) {
                    setStatus(t('settings.client.downloading'));
                    setOverallProgress((progress.fetched + progress.cached) / progress.total);
                }
            },
        });
        phaseIndex = 2;
        setStatus(t('settings.client.saving'));
        await page.store(version, {
            onProgress: ({ done, total }) => {
                if (total) setOverallProgress(done / total);
            },
        });
        if (row) row.style.setProperty('--version-progress', '100%');
        await page.activate(version.versionId);
        setStatus(t('settings.client.switched'));
        window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    } catch (_) {
        switching = false;
        setStatus(t('settings.client.switch_failed'));
        void loadClientVersionList();
    }
}

function showListLoading(list) {
    list.textContent = '';
    const item = document.createElement('li');
    item.className = 'settings-client-version-loading';
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    item.appendChild(spinner);
    list.appendChild(item);
}

function appendVersionRows() {
    const list = document.getElementById('settings-client-versions');
    if (!list || !listView) return;
    const { ordered, latestEntry, currentId, supported } = listView;
    const start = listView.rendered;
    const end = Math.min(start + PAGE_SIZE, ordered.length);
    for (let i = start; i < end; i++) {
        const entry = ordered[i];
        const isCurrent = !!currentId && entry.id === currentId;
        list.appendChild(buildVersionRow({
            versionId: entry.id,
            title: entry.code || entry.id.slice(0, 12),
            sub: entry.code ? entry.id.slice(0, 12) : '',
            label: entry.tag || '',
            latest: !!latestEntry && entry.id === latestEntry.id,
            description: entry.description || '',
            date: formatDate(entry.at),
            current: isCurrent,
            disabled: !supported || switching || isCurrent,
            onSelect: () => void switchToVersion(entry),
        }));
    }
    listView.rendered = end;
}

// 最下部近くまで表示されたら、次の分を自動で読み込む。
function fillVersionList() {
    const list = document.getElementById('settings-client-versions');
    if (!list || !listView || !list.clientHeight) return;
    let guard = 0;
    while (
        listView.rendered < listView.ordered.length &&
        list.scrollHeight - list.scrollTop - list.clientHeight < 80 &&
        guard++ < 100
    ) {
        appendVersionRows();
    }
}

async function runLoad({ announce = false } = {}) {
    const list = document.getElementById('settings-client-versions');
    if (!list) return;
    const page = getNapPage();
    if (!page) {
        setStatus(t('settings.client.no_source'));
        return;
    }
    if (announce) setStatus(t('settings.client.checking'));
    showListLoading(list);
    let entries = [];
    try {
        entries = await page.versions();
    } catch (_) {
        list.textContent = '';
        setStatus(t('settings.client.offline'));
        return;
    }
    const supported = await isClientUpdateSupported();
    const currentId = await getCurrentVersionId();
    const formal = entries.filter((entry) => !entry.tag);
    const latestEntry = formal.length ? formal[formal.length - 1] : null;
    listView = {
        ordered: [...entries].reverse(),
        latestEntry,
        currentId,
        supported,
        rendered: 0,
    };
    list.textContent = '';
    appendVersionRows();
    if (!list.dataset.autoloadBound) {
        list.dataset.autoloadBound = '1';
        list.addEventListener('scroll', fillVersionList, { passive: true });
    }
    fillVersionList();
    if (!supported) {
        setStatus(t('settings.client.unsupported'));
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

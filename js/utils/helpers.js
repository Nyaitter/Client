import { DOM } from '../dom.js';
import { getCurrentUser } from '../state.js';
import { apiRequest } from '../api.js';

export let serverClientLimits = null;
export function setServerClientLimits(limits) {
    serverClientLimits = limits;
}

export function scheduleNextFrame(callback) {
    if (typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(callback);
    }
    return window.setTimeout(callback, 0);
}

export function matchesMedia(query) {
    return (
        typeof window.matchMedia === 'function' &&
        window.matchMedia(query).matches
    );
}

export function normalizeClientInputRange(range) {
    if (!range || typeof range !== 'object') return null;
    const min = Number.isInteger(range.min) && range.min >= 0 ? range.min : null;
    const max = Number.isInteger(range.max) && range.max >= 0 ? range.max : null;
    if (min === null && max === null) return null;
    if (min !== null && max !== null && min > max) return null;
    return { min, max };
}

export function applyServerInputLimits(root = document) {
    const inputLimits = serverClientLimits?.input;
    if (!inputLimits) return;
    const selector = '[data-server-input-limit]';
    const elements = [];
    if (root instanceof Element && root.matches(selector)) elements.push(root);
    if (root?.querySelectorAll) elements.push(...root.querySelectorAll(selector));

    elements.forEach((element) => {
        if (
            !(element instanceof HTMLInputElement) &&
            !(element instanceof HTMLTextAreaElement)
        )
            return;
        const range = normalizeClientInputRange(
            inputLimits[element.dataset.serverInputLimit],
        );
        if (!range) return;
        if (range.min === null) element.removeAttribute('minlength');
        else element.minLength = range.min;
        if (range.max === null) element.removeAttribute('maxlength');
        else element.maxLength = range.max;
    });
}

export async function loadServerClientLimits() {
    try {
        const { data, error } = await apiRequest('/server/status');
        if (error || !data?.client_limits) {
            DOM.connectionErrorOverlay.classList.remove('hidden');
            return false;
        }
        setServerClientLimits(data.client_limits);
        applyServerInputLimits(document);
        return true;
    } catch (_) {
        DOM.connectionErrorOverlay.classList.remove('hidden');
        return false;
    }
}

export async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textArea = document.createElement('textarea');
    textArea.value = String(text);
    textArea.setAttribute('readonly', '');
    textArea.style.cssText =
        'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(textArea);
    textArea.select();
    const copied =
        typeof document.execCommand === 'function' &&
        document.execCommand('copy');
    textArea.remove();
    if (!copied) throw new Error('Clipboard API is not available');
}

// App Dialog System
const appDialog = {
    get modal() { return document.getElementById('app-dialog-modal'); },
    get title() { return document.getElementById('app-dialog-title'); },
    get message() { return document.getElementById('app-dialog-message'); },
    get inputGroup() { return document.getElementById('app-dialog-input-group'); },
    get input() { return document.getElementById('app-dialog-input'); },
    get closeButton() { return document.getElementById('app-dialog-close-btn'); },
    get cancelButton() { return document.getElementById('app-dialog-cancel-btn'); },
    get submitButton() { return document.getElementById('app-dialog-submit-btn'); },
};
const appDialogQueue = [];
let isAppDialogActive = false;

function showNextAppDialog() {
    const current = appDialogQueue.shift();
    if (!current) {
        isAppDialogActive = false;
        return;
    }

    const { type, message, defaultValue = '', resolve } = current;
    const isPrompt = type === 'prompt';
    const isConfirm = type === 'confirm';
    const isAlert = !isPrompt && !isConfirm;

    if (!appDialog.modal || !appDialog.message || !appDialog.submitButton) {
        if (isAlert) window.alert(message);
        if (isConfirm) resolve(window.confirm(message));
        if (isPrompt) resolve(window.prompt(message, defaultValue));
        showNextAppDialog();
        return;
    }

    isAppDialogActive = true;
    appDialog.title.textContent = isAlert
        ? '通知'
        : isConfirm
          ? '確認'
          : '入力';
    appDialog.message.textContent = String(message || '');

    if (isPrompt) {
        appDialog.inputGroup?.classList.remove('hidden');
        if (appDialog.input) {
            appDialog.input.value = defaultValue;
            applyServerInputLimits(appDialog.input);
        }
    } else {
        appDialog.inputGroup?.classList.add('hidden');
    }

    appDialog.cancelButton?.classList.toggle('hidden', isAlert);
    appDialog.submitButton.textContent = isAlert ? '閉じる' : 'OK';

    let cleanup = null;
    const closeDialog = (value) => {
        if (cleanup) cleanup();
        appDialog.modal?.classList.add('hidden');
        resolve(value);
        showNextAppDialog();
    };

    const onSubmit = (event) => {
        event?.preventDefault?.();
        if (isPrompt) {
            closeDialog(appDialog.input?.value ?? '');
            return;
        }
        closeDialog(true);
    };
    const onCancel = (event) => {
        event?.preventDefault?.();
        closeDialog(isAlert ? true : isConfirm ? false : null);
    };
    const onBackdropClick = (event) => {
        if (event.target === appDialog.modal) onCancel(event);
    };
    const onInputKeyDown = (event) => {
        if (event.key === 'Enter') onSubmit(event);
    };
    const onKeyDown = (event) => {
        if (event.key === 'Escape') onCancel(event);
    };

    cleanup = () => {
        appDialog.closeButton?.removeEventListener('click', onCancel);
        appDialog.cancelButton?.removeEventListener('click', onCancel);
        appDialog.submitButton?.removeEventListener('click', onSubmit);
        appDialog.modal?.removeEventListener('click', onBackdropClick);
        appDialog.input?.removeEventListener('keydown', onInputKeyDown);
        document.removeEventListener('keydown', onKeyDown);
    };

    appDialog.closeButton?.addEventListener('click', onCancel);
    appDialog.cancelButton?.addEventListener('click', onCancel);
    appDialog.submitButton?.addEventListener('click', onSubmit);
    appDialog.modal?.addEventListener('click', onBackdropClick);
    appDialog.input?.addEventListener('keydown', onInputKeyDown);
    document.addEventListener('keydown', onKeyDown);

    appDialog.modal.classList.remove('hidden');
    if (isPrompt && appDialog.input) {
        appDialog.input.focus();
        appDialog.input.select();
    } else {
        appDialog.submitButton.focus();
    }
}

export function openAppDialog(type, message, defaultValue = '') {
    return new Promise((resolve) => {
        appDialogQueue.push({ type, message, defaultValue, resolve });
        if (!isAppDialogActive) showNextAppDialog();
    });
}

export function showAppAlert(message) {
    return openAppDialog('alert', message);
}

export function showAppPrompt(message, defaultValue = '') {
    return openAppDialog('prompt', message, defaultValue);
}

export function showAppConfirm(message) {
    return openAppDialog('confirm', message);
}

export function formatNyaitterId(user) {
    const sourceId = String(user?.nyaitter_id ?? user?.id ?? '')
        .trim()
        .replace(/^#/, '')
        .split('@', 1)[0];
    const rawId = Number(sourceId);
    if (!Number.isSafeInteger(rawId) || rawId < 0) return '#?';
    return `#${String(rawId).padStart(4, '0')}`;
}

export function getNyaitterId(user) {
    const nyaitterAddress =
        typeof user?.nyaitter_address === 'string'
            ? user.nyaitter_address.trim()
            : '';
    const addressMatch = nyaitterAddress.match(/^#(\d{1,16})(@.+)$/);
    if (addressMatch) return `#${addressMatch[1].padStart(4, '0')}${addressMatch[2]}`;
    return formatNyaitterId(user);
}

export function normalizePostTimestampFormat(format) {
    return format === 'relative' || format === 'absolute'
        ? format
        : 'standard';
}

export function getPostTimestampFormat() {
    const userFormat = getCurrentUser()?.settings?.post_timestamp_format;
    return normalizePostTimestampFormat(userFormat);
}

export function formatPostTimestamp(post) {
    const date = new Date(post.created_at);
    if (Number.isNaN(date.getTime())) return '';

    const format = getPostTimestampFormat();
    if (format === 'absolute') {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}`;
    }

    const diff = (new Date() - date) / 1000;
    if (format === 'relative') {
        if (diff < 60) return `${Math.floor(diff)}秒前`;
        if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}日前`;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    }

    if (diff < 60) return `${Math.floor(diff)}秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
}

export function formatSecurityTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '不明な日時';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

export function formatModerationDate(value) {
    if (!value) return '日時不明';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '日時不明' : date.toLocaleString();
}

export function escapeHTML(str) {
    return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export function decodeHtmlEntities(value) {
    const source = String(value ?? '');
    if (!source.includes('&')) return source;
    const decoder = document.createElement('textarea');
    decoder.innerHTML = source;
    return decoder.value;
}

export function getSafeHttpUrl(value) {
    const raw = decodeHtmlEntities(value);
    if (
        /[\u0000-\u001F\u007F]/.test(raw) ||
        /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw)
    )
        return '';
    try {
        const parsed = new URL(raw);
        if (
            !['http:', 'https:'].includes(parsed.protocol) ||
            parsed.username ||
            parsed.password
        )
            return '';
        return parsed.href;
    } catch (_) {
        return '';
    }
}

export function getAttachmentImagePreviewUrl(url) {
    const safeUrl = getSafeHttpUrl(url);
    if (!safeUrl) return '';
    return safeUrl;
}

export function configureAttachmentImage(img, previewUrl, originalUrl) {
    if (!img) return;
    const safeOriginal = getSafeHttpUrl(originalUrl);
    const safePreview = getSafeHttpUrl(previewUrl) || safeOriginal;
    if (!safeOriginal && !safePreview) return;

    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = safePreview || safeOriginal;
    if (safeOriginal && safePreview && safeOriginal !== safePreview) {
        img.addEventListener(
            'error',
            () => {
                if (img.src !== safeOriginal) img.src = safeOriginal;
            },
            { once: true },
        );
    }
}

const urlCardCache = new Map();
export function getUrlCardTarget(card) {
    return card?.redirect_url || card?.target_url || card?.url || '';
}

export async function getUrlCard(url) {
    const safeTargetUrl = getSafeHttpUrl(url);
    if (!safeTargetUrl) return null;
    if (urlCardCache.has(safeTargetUrl)) {
        return urlCardCache.get(safeTargetUrl);
    }
    const requestPromise = (async () => {
        try {
            const { data, error } = await apiRequest(
                `/server/api/url-card?url=${encodeURIComponent(safeTargetUrl)}`,
            );
            if (error || !data || data.error) return null;
            return data;
        } catch (_) {
            return null;
        }
    })();
    urlCardCache.set(safeTargetUrl, requestPromise);
    if (urlCardCache.size > 200) {
        const oldest = urlCardCache.keys().next().value;
        urlCardCache.delete(oldest);
    }
    return requestPromise;
}

export async function appendUrlCard(container, url) {
    if (!container) return;
    const card = await getUrlCard(url);
    if (!card || !card.title) return;
    const targetUrl = getSafeHttpUrl(getUrlCardTarget(card));
    if (!targetUrl) return;

    const cardEl = document.createElement('a');
    cardEl.href = targetUrl;
    cardEl.target = '_blank';
    cardEl.rel = 'noopener noreferrer';
    cardEl.className = 'post-url-card';

    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'post-url-card-image-wrapper';
    const imageEl = document.createElement('img');
    imageEl.className = 'post-url-card-image';
    imageEl.alt = card.title || '';
    imageEl.src = getSafeHttpUrl(card.image) || '/favicon.png';
    imageEl.loading = 'lazy';
    imageWrapper.appendChild(imageEl);
    cardEl.appendChild(imageWrapper);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'post-url-card-body';
    const titleEl = document.createElement('div');
    titleEl.className = 'post-url-card-title';
    titleEl.textContent = card.title;
    bodyEl.appendChild(titleEl);

    if (card.description) {
        const descEl = document.createElement('div');
        descEl.className = 'post-url-card-description';
        descEl.textContent = card.description;
        bodyEl.appendChild(descEl);
    }

    const hostEl = document.createElement('div');
    hostEl.className = 'post-url-card-host';
    try {
        hostEl.textContent = new URL(targetUrl).hostname;
    } catch (_) {
        hostEl.textContent = targetUrl;
    }
    bodyEl.appendChild(hostEl);
    cardEl.appendChild(bodyEl);
    container.appendChild(cardEl);
}

export function getUserIconUrl(user) {
    const iconData =
        typeof user?.icon_data === 'string' ? user.icon_data.trim() : '';
    if (iconData) {
        if (/^https?:\/\//i.test(iconData)) {
            return getSafeHttpUrl(iconData) || '/logo.png';
        }
        const configuredUrl = globalThis.NyaitterClientConfig?.userFileUrl?.(iconData);
        if (configuredUrl) return configuredUrl;
    }

    const userId = Number(user?.id);
    const fallbackUrl =
        Number.isSafeInteger(userId) && userId > 0
            ? globalThis.NyaitterClientConfig?.apiUrl?.(
                  `/server/api/users/${encodeURIComponent(String(userId))}/icon`,
              )
            : null;
    return fallbackUrl || '/logo.png';
}

export function getUserHeaderImageUrl(user) {
    const headerData =
        typeof user?.header_data === 'string' ? user.header_data.trim() : '';
    if (headerData) {
        if (/^https?:\/\//i.test(headerData)) {
            return getSafeHttpUrl(headerData) || '';
        }
        const configuredUrl = globalThis.NyaitterClientConfig?.userFileUrl?.(headerData);
        if (configuredUrl) return configuredUrl;
    }
    return '';
}

export async function compressImage(
    file,
    { maxWidth = 2048, maxHeight = 2048, quality = 0.82 } = {},
) {
    if (!file || !file.type.startsWith('image/')) return file;
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;

    return new Promise((resolve) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
            img.onload = () => {
                let { width, height } = img;
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => {
                        if (!blob || blob.size >= file.size) {
                            resolve(file);
                        } else {
                            resolve(
                                new File([blob], file.name, {
                                    type: blob.type,
                                    lastModified: Date.now(),
                                }),
                            );
                        }
                    },
                    file.type === 'image/png' ? 'image/png' : 'image/jpeg',
                    quality,
                );
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

export function imageDataUrlToFile(dataUrl, filename = 'image.png') {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
}

export function showLoading(show) {
    if (!DOM.loadingOverlay) return;
    DOM.loadingOverlay.classList.toggle('hidden', !show);
    DOM.loadingOverlay.setAttribute('aria-hidden', String(!show));
    DOM.loadingOverlay.setAttribute('aria-busy', String(show));
}

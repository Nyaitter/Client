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
    return formatNyaitterId(user);
}

const POST_TIMESTAMP_FORMATS = new Set([
    'relative',
    'relative_detailed',
    'absolute_24',
    'absolute_12',
]);

export function normalizePostTimestampFormat(value) {
    return POST_TIMESTAMP_FORMATS.has(value) ? value : 'relative';
}

export function getPostTimestampFormat() {
    return normalizePostTimestampFormat(
        getCurrentUser()?.settings?.post_timestamp_format,
    );
}

export function formatPostTimestamp(post, format = getPostTimestampFormat()) {
    const value = post?.created_at;
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '日時不明';

    const pad = (number) => String(number).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = date.getHours();
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());

    if (format === 'absolute_24') {
        return `${year}/${month}/${day} ${pad(hour)}:${minute}:${second}`;
    }
    if (format === 'absolute_12') {
        const period = hour < 12 ? '午前' : '午後';
        const hour12 = hour % 12 || 12;
        return `${year}/${month}/${day} ${period} ${pad(hour12)}:${minute}:${second}`;
    }

    const elapsedSeconds = Math.max(
        0,
        Math.floor((Date.now() - date.getTime()) / 1000),
    );
    let remaining = elapsedSeconds;
    const units = [
        ['年', 365 * 24 * 60 * 60],
        ['ヶ月', 30 * 24 * 60 * 60],
        ['日', 24 * 60 * 60],
        ['時間', 60 * 60],
        ['分', 60],
        ['秒', 1],
    ];
    const parts = [];
    for (const [label, seconds] of units) {
        const amount = Math.floor(remaining / seconds);
        remaining %= seconds;
        if (amount > 0) {
            parts.push(`${amount}${label}`);
            if (format === 'relative') break;
        }
    }
    return `${parts.length > 0 ? parts.join('') : '0秒'}前`;
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
const URL_CARD_CACHE_LIMIT = 200;

export function getUrlCardTarget(content) {
    const source = String(content || '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`\r\n]{0,500}`/g, '');
    const urlPattern =
        /https:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,63}\b(?:[-a-zA-Z0-9()@:%_+.~#?&//=;]*)/g;
    let match;
    while ((match = urlPattern.exec(source)) !== null) {
        const candidate = match[0];
        const before = source[match.index - 1] || '';
        const after = source[match.index + candidate.length] || '';
        if (before === '<' && after === '>') continue;

        const safeUrl = getSafeHttpUrl(candidate);
        if (!safeUrl) continue;
        try {
            const parsed = new URL(safeUrl);
            if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) {
                return parsed.href;
            }
        } catch (_) {
            // 次の候補を検査する。
        }
    }
    return null;
}

export function getUrlCard(url) {
    if (urlCardCache.has(url)) return urlCardCache.get(url);

    const requestPromise = apiRequest(
        `/server/api/url-cards?url=${encodeURIComponent(url)}`,
    )
        .then(({ data, error }) => {
            if (error || !data?.card || typeof data.card !== 'object') return null;
            const safeUrl = getSafeHttpUrl(data.card.url) || url;

            if (data.card.type === 'nyaitter_post' && data.card.post) {
                return {
                    type: 'nyaitter_post',
                    url: safeUrl,
                    postId: Number(data.card.post_id || data.card.post?.id),
                    post: data.card.post,
                };
            }

            const title = String(data.card.title || '').trim().slice(0, 160);
            if (!title) return null;
            return {
                type: 'link',
                url: safeUrl,
                hostname: String(data.card.hostname || '').trim().slice(0, 253),
                title,
                description: String(data.card.description || '').trim().slice(0, 280),
                siteName: String(data.card.site_name || '').trim().slice(0, 100),
            };
        })
        .catch(() => null);

    urlCardCache.set(url, requestPromise);
    while (urlCardCache.size > URL_CARD_CACHE_LIMIT) {
        urlCardCache.delete(urlCardCache.keys().next().value);
    }
    return requestPromise;
}

export function appendUrlCard(container, content, contextOptions = {}) {
    if (!container) return;
    const targetUrl = getUrlCardTarget(content);
    if (!targetUrl) return;

    // If post already has an explicit quote, skip embedded URL quote card
    if (contextOptions.hasExistingQuote) return;

    const placeholder = document.createElement('div');
    placeholder.className = 'url-card-placeholder';
    placeholder.setAttribute('aria-live', 'polite');
    container.appendChild(placeholder);

    void getUrlCard(targetUrl).then(async (card) => {
        if (!card || !placeholder.parentElement) {
            placeholder.remove();
            return;
        }

        if (card.type === 'nyaitter_post' && card.post && typeof contextOptions.renderPost === 'function') {
            const nestedContainer = document.createElement('div');
            nestedContainer.className = 'nested-repost-container';
            const nestedPostEl = await contextOptions.renderPost(
                card.post,
                card.post.author || card.post.user,
                { ...(contextOptions.options || {}), isNested: true, clampHeight: true },
            );
            if (nestedPostEl) {
                nestedContainer.appendChild(nestedPostEl);
                placeholder.replaceWith(nestedContainer);
                return;
            }
        }

        const cardLink = document.createElement('a');
        cardLink.className = 'url-card';
        cardLink.href = card.url;
        cardLink.target = '_blank';
        cardLink.rel = 'noopener noreferrer';

        const hostname = document.createElement('span');
        hostname.className = 'url-card-hostname';
        hostname.textContent = card.siteName || card.hostname;
        const title = document.createElement('strong');
        title.className = 'url-card-title';
        title.textContent = card.title;
        cardLink.append(hostname, title);

        if (card.description) {
            const description = document.createElement('span');
            description.className = 'url-card-description';
            description.textContent = card.description;
            cardLink.appendChild(description);
        }
        placeholder.replaceWith(cardLink);
    });
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
    if (Number.isSafeInteger(userId) && userId > 0) {
        const fallbackUrl = globalThis.NyaitterClientConfig?.apiUrl?.(
            `/server/api/users/${encodeURIComponent(String(userId))}/icon`,
        );
        return fallbackUrl || `/server/api/users/${encodeURIComponent(String(userId))}/icon`;
    }

    return '/emoji/neko.svg';
}

export function getUserHeaderImageUrl(user) {
    const headerData =
        typeof user?.header_image === 'string'
            ? user.header_image.trim()
            : typeof user?.header_data === 'string'
              ? user.header_data.trim()
              : '';
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

let loadingScreenHoldCount = 0;

export function holdLoadingScreen() {
    loadingScreenHoldCount += 1;
    showLoading(true);
    let released = false;

    return () => {
        if (released) return;
        released = true;
        loadingScreenHoldCount = Math.max(0, loadingScreenHoldCount - 1);
        if (loadingScreenHoldCount === 0) showLoading(false);
    };
}

export function showLoading(show) {
    if (!DOM.loadingOverlay) return;
    const visible = loadingScreenHoldCount > 0 || Boolean(show);
    DOM.loadingOverlay.classList.toggle('hidden', !visible);
    DOM.loadingOverlay.setAttribute('aria-hidden', String(!visible));
    DOM.loadingOverlay.setAttribute('aria-busy', String(visible));
}

export function getGroupIconUrl(value) {
    const icon = typeof value === 'object' && value !== null
        ? (value.icon_data || value.iconData || '')
        : value;
    const image = typeof icon === 'string' ? icon.trim() : '';
    if (!image) return '';
    if (/^data:image\//i.test(image)) return image;
    if (/^https?:\/\//i.test(image)) return getSafeHttpUrl(image) || image;
    const configuredUrl = globalThis.NyaitterClientConfig?.userFileUrl?.(image);
    if (typeof configuredUrl === 'string' && configuredUrl) return configuredUrl;
    return image;
}

export function getGroupBadgesHtml(user) {
    if (!user) return '';
    const badges = Array.isArray(user.group_badges)
        ? user.group_badges
        : (Array.isArray(user.groupBadges) ? user.groupBadges : []);
    const validBadges = badges
        .filter((b) => b && getGroupIconUrl(b))
        .slice(0, 3);
    if (validBadges.length === 0) return '';
    return `<span class="user-group-badges">${validBadges
        .map((b) => `<span role="link" tabindex="0" class="user-group-badge-link" title="${escapeHTML(b.name || '参加グループ')}" onclick="event.preventDefault(); event.stopPropagation(); window.location.hash='#group/${encodeURIComponent(b.id)}';"><img src="${escapeHTML(getGroupIconUrl(b))}" class="user-group-badge" alt="${escapeHTML(b.name || 'グループ')}"></span>`)
        .join('')}</span>`;
}

export function renderGroupBadgesElement(user) {
    if (!user) return null;
    const badges = Array.isArray(user.group_badges)
        ? user.group_badges
        : (Array.isArray(user.groupBadges) ? user.groupBadges : []);
    const validBadges = badges
        .filter((b) => b && getGroupIconUrl(b))
        .slice(0, 3);
    if (validBadges.length === 0) return null;

    const span = document.createElement('span');
    span.className = 'user-group-badges';
    validBadges.forEach((b) => {
        const link = document.createElement('a');
        link.href = `#group/${encodeURIComponent(b.id)}`;
        link.className = 'user-group-badge-link';
        link.title = b.name || '参加グループ';
        link.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        const img = document.createElement('img');
        img.src = getGroupIconUrl(b);
        img.className = 'user-group-badge';
        img.alt = b.name || 'グループ';
        link.appendChild(img);
        span.appendChild(link);
    });
    return span;
}

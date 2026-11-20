import { apiRequest } from '../api.js';
import { getLanguage, languageName } from './i18n.js';
import { getCurrentUser } from '../state.js';

const translationCache = new Map();

const PERSISTENT_CACHE_KEY = 'nyaitter-translation-cache-v2';
const LEGACY_CACHE_KEY = 'nyaitter-translation-cache';
const PERSISTENT_CACHE_LIMIT = 300;
let persistentEntries = null;

function loadPersistentEntries() {
    if (persistentEntries) return persistentEntries;
    try { localStorage.removeItem(LEGACY_CACHE_KEY); } catch (_) {}
    try {
        const parsed = JSON.parse(localStorage.getItem(PERSISTENT_CACHE_KEY) || '{}');
        persistentEntries = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        persistentEntries = {};
    }
    return persistentEntries;
}

function savePersistentEntries() {
    try {
        localStorage.setItem(PERSISTENT_CACHE_KEY, JSON.stringify(persistentEntries));
    } catch (_) {
        // 容量超過時はキャッシュを空にして入れ直す。
        try {
            persistentEntries = {};
            localStorage.setItem(PERSISTENT_CACHE_KEY, '{}');
        } catch (_) {}
    }
}

function lookupPersistent(cacheKey) {
    const entry = loadPersistentEntries()[cacheKey];
    if (!entry || typeof entry.t !== 'string') return null;
    entry.a = Date.now();
    return { translatedText: entry.t, sourceLanguage: entry.s || null };
}

function storePersistent(cacheKey, result) {
    const entries = loadPersistentEntries();
    entries[cacheKey] = { t: result.translatedText, s: result.sourceLanguage, a: Date.now() };
    const keys = Object.keys(entries);
    if (keys.length > PERSISTENT_CACHE_LIMIT) {
        keys.sort((a, b) => (entries[a].a || 0) - (entries[b].a || 0));
        for (const key of keys.slice(0, keys.length - PERSISTENT_CACHE_LIMIT)) delete entries[key];
    }
    savePersistentEntries();
}

let visibilityObserver = null;
const visibilityWaiters = new Map();

// 要素が画面に表示されたら一度だけ実行する。表示されていないコンテンツは対象にしない。
export function whenVisible(element, callback) {
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
        callback();
        return;
    }
    if (!visibilityObserver) {
        visibilityObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                visibilityObserver.unobserve(entry.target);
                const waiter = visibilityWaiters.get(entry.target);
                visibilityWaiters.delete(entry.target);
                if (waiter) waiter();
            }
        }, { rootMargin: '200px 0px' });
    }
    if (visibilityWaiters.has(element)) return;
    visibilityWaiters.set(element, callback);
    visibilityObserver.observe(element);
}

export function autoTranslateEnabled() {
    return getCurrentUser()?.settings?.auto_translate !== false;
}

export function sameLanguage(a, b) {
    const left = String(a || '').trim().toLowerCase();
    const right = String(b || '').trim().toLowerCase();
    if (!left || !right) return false;
    if (left === right) return true;
    if (left.startsWith('zh') || right.startsWith('zh')) return false;
    return left.split('-')[0] === right.split('-')[0];
}

export function languageDisplayName(code) {
    try {
        const name = new Intl.DisplayNames([getLanguage()], { type: 'language' }).of(code);
        if (name) return name;
    } catch (_) {
        // Intl が引けない言語はパック側の名前へ寄せる。
    }
    return languageName(code) || String(code || '');
}

// サーバーへ翻訳を依頼する。失敗時は null。
export async function translateText(text, { sourceLanguage } = {}) {
    const source = String(text || '');
    if (!source.trim()) return null;
    const targetLanguage = getLanguage();
    const cacheKey = `${targetLanguage}\n${sourceLanguage || ''}\n${source}`;
    if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
    const cached = lookupPersistent(cacheKey);
    if (cached) {
        const promise = Promise.resolve(cached);
        translationCache.set(cacheKey, promise);
        return promise;
    }
    const promise = (async () => {
        const { data, error } = await apiRequest('/server/api/translate', {
            method: 'POST',
            body: {
                text: source,
                target_language: targetLanguage,
                ...(sourceLanguage ? { source_language: sourceLanguage } : {}),
            },
        });
        if (error || !data || typeof data.translated_text !== 'string') return null;
        const result = {
            translatedText: data.translated_text,
            sourceLanguage: data.source_language || sourceLanguage || null,
        };
        storePersistent(cacheKey, result);
        return result;
    })();
    translationCache.set(cacheKey, promise);
    return promise;
}


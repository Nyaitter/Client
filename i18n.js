/*
 * NyaitterClientの多言語対応
 *
 * 言語とパックのパスは manifest.json の default_language / language_packs で設定する。
 * 選択した言語はこの端末に保存され、次回起動時も使われる。
 */
(() => {
    'use strict';

    const STORAGE_KEY = 'nyaitter-language';
    const FALLBACK_LANGUAGE = 'ja';
    const LANGUAGE_NAMES = Object.freeze({
        ja: '日本語', en: 'English', ko: '한국어', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文',
        es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português', it: 'Italiano',
        ru: 'Русский', ar: 'العربية', emoji: 'Emoji',
    });

    const config = globalThis.NyaitterClientConfig;

    // このスクリプト自身の位置を配信ベースとし、任意のサブパス配下でも成立させる。
    const pageBaseUrl = (() => {
        const scriptUrl =
            typeof document !== 'undefined' ? document.currentScript?.src : undefined;
        const base = scriptUrl || (typeof self !== 'undefined' ? self.location?.href : undefined);
        return base ? new URL('.', base).href : null;
    })();

    let defaultLanguage = FALLBACK_LANGUAGE;
    let languagePacks = {};
    let currentLanguage = FALLBACK_LANGUAGE;
    const loadedPacks = {};

    // manifest の api_url と同じ規則でパックのパスを配信ベース配下として解決する。
    function resolvePackUrl(path) {
        const source = String(path || '').trim();
        if (!source) return null;
        if (/^https?:\/\//i.test(source)) return source;
        if (!pageBaseUrl) return source;
        return new URL(source.replace(/^\/+/, ''), pageBaseUrl).href;
    }

    async function fetchPack(language) {
        if (loadedPacks[language]) return loadedPacks[language];
        const url = resolvePackUrl(languagePacks[language]);
        if (!url) return null;
        try {
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) return null;
            const pack = await response.json();
            if (!pack || typeof pack !== 'object') return null;
            loadedPacks[language] = pack;
            return pack;
        } catch (_) {
            return null;
        }
    }

    function readSavedLanguage() {
        try {
            return String(localStorage.getItem(STORAGE_KEY) || '').trim();
        } catch (_) {
            return '';
        }
    }

    // 端末の言語から、翻訳のある言語を選ぶ。合う言語が無ければ英語にする。
    function detectLanguage() {
        const candidates = [];
        if (typeof navigator !== 'undefined') {
            if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
            if (navigator.language) candidates.push(navigator.language);
        }
        for (const raw of candidates) {
            const tag = String(raw || '').trim();
            if (!tag) continue;
            if (languagePacks[tag]) return tag;
            const lower = tag.toLowerCase();
            if (lower === 'zh' || lower.startsWith('zh-')) {
                if (/(tw|hk|mo|hant)/.test(lower) && languagePacks['zh-Hant']) return 'zh-Hant';
                if (languagePacks['zh-Hans']) return 'zh-Hans';
                continue;
            }
            const base = lower.split('-')[0];
            const match = Object.keys(languagePacks).find(
                (code) => code.toLowerCase() === base || code.toLowerCase().startsWith(`${base}-`),
            );
            if (match) return match;
        }
        return languagePacks.en ? 'en' : defaultLanguage;
    }

    function applyStaticTranslations() {
        if (typeof document === 'undefined') return;
        document.querySelectorAll('[data-i18n]').forEach((element) => {
            element.textContent = t(element.dataset.i18n);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
            element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
        });
        document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
            element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
        });
        document.querySelectorAll('[data-i18n-title]').forEach((element) => {
            element.setAttribute('title', t(element.dataset.i18nTitle));
        });
    }

    const ready = (async () => {
        try {
            if (config?.ready) await config.ready;
        } catch (_) {
            // マニフェストが読めない環境でも既定の言語で起動する。
        }
        defaultLanguage = String(config?.defaultLanguage || FALLBACK_LANGUAGE).trim() || FALLBACK_LANGUAGE;
        const configured = config?.languagePacks;
        languagePacks =
            configured && typeof configured === 'object' ? { ...configured } : {};
        if (!Object.keys(languagePacks).length) {
            languagePacks = { [defaultLanguage]: `/langs/${defaultLanguage}.json` };
        }
        if (!languagePacks[defaultLanguage]) {
            languagePacks[defaultLanguage] = `/langs/${defaultLanguage}.json`;
        }

        const saved = readSavedLanguage();
        if (saved && languagePacks[saved]) {
            currentLanguage = saved;
        } else {
            currentLanguage = detectLanguage();
            try {
                localStorage.setItem(STORAGE_KEY, currentLanguage);
            } catch (_) {}
        }
        if (typeof document !== 'undefined') {
            document.documentElement.lang = currentLanguage;
        }

        await fetchPack(currentLanguage);
        if (defaultLanguage !== currentLanguage) await fetchPack(defaultLanguage);
        applyStaticTranslations();
    })();

    function t(key, params) {
        const name = String(key || '');
        let value = loadedPacks[currentLanguage]?.[name];
        if (typeof value !== 'string') value = loadedPacks[defaultLanguage]?.[name];
        if (typeof value !== 'string') value = name;
        if (params && typeof params === 'object') {
            value = value.replace(/\{(\w+)\}/g, (match, paramName) =>
                params[paramName] != null ? String(params[paramName]) : match,
            );
        }
        return value;
    }

    function getLanguage() {
        return currentLanguage;
    }

    function getDefaultLanguage() {
        return defaultLanguage;
    }

    function getAvailableLanguages() {
        return Object.keys(languagePacks);
    }

    function languageName(language) {
        const code = String(language || '');
        const pack = loadedPacks[code];
        if (pack && typeof pack['meta.name'] === 'string' && pack['meta.name']) return pack['meta.name'];
        return LANGUAGE_NAMES[code] || code;
    }

    // 切り替え先のパックを読み込んでから現在言語を差し替える。失敗時は変更しない。
    async function setLanguage(language) {
        const next = String(language || '').trim();
        if (!next || !languagePacks[next] || next === currentLanguage) return false;
        const pack = await fetchPack(next);
        if (!pack) return false;
        currentLanguage = next;
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch (_) {
            // 保存できない環境でもこのセッション内では切り替える。
        }
        if (typeof document !== 'undefined') {
            document.documentElement.lang = next;
        }
        applyStaticTranslations();
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('nyaitter-language-changed', { detail: { language: next } }));
        }
        return true;
    }

    globalThis.NyaitterI18n = Object.freeze({
        ready,
        t,
        getLanguage,
        getDefaultLanguage,
        getAvailableLanguages,
        languageName,
        setLanguage,
    });
})();

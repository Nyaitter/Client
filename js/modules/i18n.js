// i18n.js (classic script) が公開する NyaitterI18n へのモジュール用ラッパー。
const backend = () => globalThis.NyaitterI18n;

export const i18nReady = backend()?.ready ?? Promise.resolve();

export function t(key, params) {
    const api = backend();
    return api ? api.t(key, params) : String(key || '');
}

export function getLanguage() {
    return backend()?.getLanguage() ?? 'ja';
}

export function getDefaultLanguage() {
    return backend()?.getDefaultLanguage() ?? 'ja';
}

export function getAvailableLanguages() {
    return backend()?.getAvailableLanguages() ?? ['ja'];
}

export function languageName(language) {
    return backend()?.languageName(language) ?? String(language || '');
}

export async function setLanguage(language) {
    const api = backend();
    return api ? api.setLanguage(language) : false;
}

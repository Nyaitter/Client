import { apiRequest } from '../api.js';
import { getLanguage, languageName } from './i18n.js';
import { getCurrentUser } from '../state.js';

const translationCache = new Map();

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
        return {
            translatedText: data.translated_text,
            sourceLanguage: data.source_language || sourceLanguage || null,
        };
    })();
    translationCache.set(cacheKey, promise);
    return promise;
}

export async function translateTexts(texts, { sourceLanguage, targetLanguage } = {}) {
    const { data, error } = await apiRequest('/server/api/translate', {
        method: 'POST',
        body: {
            texts,
            target_language: targetLanguage || getLanguage(),
            ...(sourceLanguage ? { source_language: sourceLanguage } : {}),
        },
    });
    if (error || !data || !Array.isArray(data.translations)) return null;
    return data.translations.map((item) => ({
        translatedText: item?.translated_text,
        sourceLanguage: item?.source_language || sourceLanguage || null,
    }));
}

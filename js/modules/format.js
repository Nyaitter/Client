import { getEmoji_picker_theme } from '../state.js';
import {
    customEmojiIds,
    customEmojiPromise,
    customEmojiSet,
    getEmoji,
} from './nyarkdown.js';

export {
    customEmojiIds,
    customEmojiPromise,
    customEmojiSet,
    getEmoji,
};

// ルート直下絶対パスではなく、このモジュール (js/modules/) からの相対で解決する。
// 配信ベース配下 (任意のリバースプロキシ接頭辞) でも壊れない。
const EMOJI_BASE_URL = new URL('../../emoji/', import.meta.url);

// emoji-mart is only needed when the picker is opened, so load it on first
// use instead of blocking the initial page load with a synchronous script.
const EMOJI_MART_SRC = 'https://cdn.jsdelivr.net/npm/emoji-mart@5.6.0/dist/browser.js';
const EMOJI_MART_INTEGRITY = 'sha384-lONtvEeik96slH87Kr9CY74xGakohuxbgkyhwbPDOM9ZzVfW7Twaltwp+WrerZ9k';
let emojiMartPromise = null;
function ensureEmojiMart() {
    if (window.EmojiMart) return Promise.resolve();
    if (!emojiMartPromise) {
        emojiMartPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = EMOJI_MART_SRC;
            script.integrity = EMOJI_MART_INTEGRITY;
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve();
            script.onerror = (error) => {
                emojiMartPromise = null;
                reject(error);
            };
            document.head.appendChild(script);
        });
    }
    return emojiMartPromise;
}
const LOGO_URL = new URL('../../logo.png', import.meta.url).href;

export async function emoji_picker_create({
    onEmojiSelect = () => {},
    onClickOutside = () => {},
    triggerButton = null,
} = {}) {
    await Promise.all([customEmojiPromise, ensureEmojiMart()]);
    const custom = customEmojiIds.map((item) => ({
        id: item,
        name: item,
        keywords: [item, 'NyaitterEmoji'],
        skins: [{ src: `${EMOJI_BASE_URL.href}${encodeURIComponent(item)}.svg` }],
    }));

    const response = await fetch('https://cdn.jsdelivr.net/npm/@emoji-mart/data@1.2.1/sets/15/native.json');
    const data = await response.json();
    const i18nJaResponse = await fetch('https://cdn.jsdelivr.net/npm/@emoji-mart/data@1.2.1/i18n/ja.json');
    const i18nJa = await i18nJaResponse.json();

    const pickerOptions = {
        data,
        i18n: i18nJa,
        set: 'native',
        searchPosition: 'none',
        locale: 'ja',
        custom: [
            {
                id: 'nyaitter',
                name: 'NyaitterEmoji',
                emojis: custom,
            },
        ],
        categoryIcons: {
            nyaitter: {
                svg: `<svg viewBox="0 0 1 1" aria-label="Nyaitter"><image href="${LOGO_URL}" width="1" height="1" preserveAspectRatio="xMidYMid meet"></image></svg>`,
            },
        },
        categories: [
            'frequent',
            'nyaitter',
            'people',
            'nature',
            'foods',
            'activity',
            'places',
            'objects',
            'symbols',
            'flags',
        ],
        skinTonePosition: 'none',
        skin: '1',
        theme: getEmoji_picker_theme(),
        onEmojiSelect: (emoji) => {
            const isNyaitter =
                (Array.isArray(emoji.keywords) && emoji.keywords.includes('NyaitterEmoji')) ||
                customEmojiSet.has(emoji.id);
            const value = isNyaitter
                ? `_${emoji.id}_`
                : String(emoji.native || '');
            if (!value) return;
            onEmojiSelect(value, emoji);
        },
        onClickOutside: (event) => {
            if (triggerButton && triggerButton.contains(event.target)) return;
            onClickOutside(event);
        },
    };

    const picker = new EmojiMart.Picker(pickerOptions);
    picker.id = 'emoji-picker';
    picker.style.position = 'absolute';
    picker.style.zIndex = '1000';
    return picker;
}

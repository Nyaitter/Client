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

export async function emoji_picker_create({
    onEmojiSelect = () => {},
    onClickOutside = () => {},
    triggerButton = null,
} = {}) {
    await customEmojiPromise;
    const custom = customEmojiIds.map((item) => ({
        id: item,
        name: item,
        keywords: [item, 'NyaitterEmoji'],
        skins: [{ src: `/emoji/${encodeURIComponent(item)}.svg` }],
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
                svg: `<svg viewBox="0 0 1 1" aria-label="Nyaitter"><image href="/logo.png" width="1" height="1" preserveAspectRatio="xMidYMid meet"></image></svg>`,
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

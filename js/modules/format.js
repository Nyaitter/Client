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
    const customEmojiMart = customEmojiIds.map((item) => ({
        id: item,
        name: item,
        skins: [{ src: `/emoji/${encodeURIComponent(item)}.svg` }],
    }));

    const response = await fetch('https://cdn.jsdelivr.net/npm/@emoji-mart/data@1.2.1/sets/15/native.json');
    const data = await response.json();
    const i18nJaResponse = await fetch('https://cdn.jsdelivr.net/npm/@emoji-mart/data@1.2.1/i18n/ja.json');
    const i18nJa = await i18nJaResponse.json();

    const pickerOptions = {
        data,
        i18n: i18nJa,
        custom: [{ id: 'nyaitter', name: 'Nyaitter', emojis: customEmojiMart }],
        categories: [
            'nyaitter',
            'frequent',
            'people',
            'nature',
            'foods',
            'activity',
            'places',
            'objects',
            'symbols',
            'flags',
        ],
        onEmojiSelect,
        onClickOutside: (event) => {
            if (triggerButton && triggerButton.contains(event.target)) return;
            onClickOutside(event);
        },
        theme: getEmoji_picker_theme(),
    };

    const picker = new EmojiMart.Picker(pickerOptions);
    picker.id = 'emoji-picker';
    picker.style.position = 'absolute';
    picker.style.zIndex = '1000';
    return picker;
}

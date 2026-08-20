import { getCurrentUser } from '../state.js';
import { getCachedUser } from './cache.js';
import {
    escapeHTML,
    decodeHtmlEntities,
    getSafeHttpUrl,
} from '../utils/helpers.js';
import { renderLimitedMarkdown } from '../safeMarkdown.js';

/**
 * NyarkDown: Nyaitterの本文装飾・制限付きMarkdownを安全なHTMLへ変換する再利用モジュール。
 *
 * userCacheにはメンション表示名の解決に使用するMapを渡せます。装飾機能は
 * allowContentDecorationsをtrueにした場合だけ有効です。
 */
export let customEmojiIds = [];
export let customEmojiSet = new Set();

export const customEmojiPromise = (async () => {
    try {
        const res = await fetch('/emoji/list.json', { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();
        const emojiList = Array.isArray(list) ? list : [];
        customEmojiIds = [
            ...new Set(
                emojiList
                    .map((emoji) => String(emoji?.id || ''))
                    .filter((id) => /^[A-Za-z0-9_-]{1,80}$/.test(id)),
            ),
        ].sort((a, b) => b.length - a.length || a.localeCompare(b));
        customEmojiSet = new Set(customEmojiIds);
        return emojiList;
    } catch (error) {
        console.warn('[emoji] Custom emoji list could not be loaded:', error);
        customEmojiIds = [];
        customEmojiSet = new Set();
        return [];
    }
})();

// Fast check for characters that might require twemoji/emojione parsing.
const MAYBE_EMOJI_REGEX = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/u;

export function getEmoji(str) {
    if (!str || typeof str !== 'string') return '';
    const emojiSetting = getCurrentUser()?.settings?.emoji || 'twemoji';

    switch (emojiSetting) {
        case 'twemoji': {
            if (typeof window.twemoji === 'undefined') return str;
            if (!MAYBE_EMOJI_REGEX.test(str)) return str;
            try {
                return window.twemoji.parse(str, {
                    callback: (icon) =>
                        `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${icon}.svg`,
                });
            } catch (_) {
                return str;
            }
        }
        case 'emojione': {
            if (typeof window.emojione === 'undefined') return str;
            if (!MAYBE_EMOJI_REGEX.test(str) && !/:[a-zA-Z0-9_+]+:/.test(str)) return str;
            try {
                return window.emojione.toImage(str);
            } catch (_) {
                return str;
            }
        }
        default:
            return str;
    }
}

const NAMED_COLORS = new Set([
    'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange',
    'purple', 'pink', 'gray', 'grey', 'brown', 'cyan', 'magenta',
    'lime', 'navy', 'teal', 'silver', 'maroon', 'olive', 'aqua',
    'fuchsia',
]);

const DECORATION_NAMES = ['color', 'size', 'rotate', 'x', 'y'];

function resolveDecorationName(abbreviation) {
    const prefix = String(abbreviation || '').toLowerCase();
    const matches = DECORATION_NAMES.filter((name) => name.startsWith(prefix));
    return matches.length === 1 ? matches[0] : null;
}

function parseDecorationValue(name, rawValue) {
    const value = String(rawValue || '').trim().toLowerCase();
    if (name === 'color') {
        if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)) return value;
        return NAMED_COLORS.has(value) ? value : null;
    }
    if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    const limits = {
        size: [0.5, 3],
        rotate: [-180, 180],
        x: [-2, 2],
        y: [-2, 2],
    };
    const [minimum, maximum] = limits[name] || [];
    if (number < minimum || number > maximum) return null;
    const normalized = Math.round(number * 1000) / 1000;
    return Object.is(normalized, -0) ? 0 : normalized;
}

const ESCAPABLE_CHARS = new Set(['\\', '[', ']', '/']);

function unescapeDecorationEscapes(value) {
    let output = '';
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        const nextCharacter = value[index + 1];
        if (character === '\\' && ESCAPABLE_CHARS.has(nextCharacter)) {
            output += nextCharacter;
            index += 1;
            continue;
        }
        output += character;
    }
    return output;
}

function isEscapedDecorationStart(value, index) {
    let slashCount = 0;
    for (let position = index - 1; position >= 0; position -= 1) {
        if (value[position] !== '\\') break;
        slashCount += 1;
    }
    return slashCount % 2 === 1;
}

const DECORATION_DIRECTIVE_PATTERN =
    /\[(?:\/([a-z]{0,6})|([a-z]{1,6})=([^\]\r\n]{1,32}))\]/gi;
const URL_REGEX =
    /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=;]*))/g;
const HASHTAG_REGEX = /#([^<>\/@#\s]+)/g;
const MENTION_REGEX = /@(\d+)/g;
const CUSTOM_EMOJI_PATTERN = /_([A-Za-z0-9_-]{1,80})_/g;

/**
 * NyarkDown本文を安全なHTMLへ変換します。
 *
 * @param {string} text 変換対象の本文
 * @param {Map} userCache メンション解決に利用するユーザーキャッシュ
 * @param {object} options 表示場所ごとの機能設定
 * @returns {string} サニタイズ済みHTML
 */
export function renderNyarkDown(
    text,
    userCache = new Map(),
    {
        allowMarkdown = false,
        editorSyntax = false,
        allowContentDecorations = false,
    } = {},
) {
    const renderSyntax = (syntax) =>
        editorSyntax
            ? `<span class="markdown-syntax">${escapeHTML(syntax)}</span>`
            : '';

    const createCustomEmojiMarkup = (emojiId) => {
        const image = `<img src="/emoji/${encodeURIComponent(emojiId)}.svg" alt="_${emojiId}_" data-emoji-id="${emojiId}" style="height: 1.2em; vertical-align: -0.2em; margin: 0 0.05em;" class="nyaitter-emoji">`;
        if (!editorSyntax) return image;
        return `<span class="markdown-editor-emoji" data-emoji-id="${emojiId}">${renderSyntax('_')}${image}<span class="markdown-editor-emoji-id" hidden>${escapeHTML(emojiId)}</span>${renderSyntax('_')}</span>`;
    };

    const replaceCustomEmoji = (value) => {
        if (!value.includes('_')) return value;
        return value.replace(CUSTOM_EMOJI_PATTERN, (match, emojiId) => {
            if (customEmojiSet.has(emojiId)) {
                return createCustomEmojiMarkup(emojiId);
            }
            return match;
        });
    };

    const decorationDefaults = {
        color: null,
        size: 1,
        rotate: 0,
        x: 0,
        y: 0,
    };
    const decoration = { ...decorationDefaults };

    const renderPlainText = (standardText) => {
        const urls = [];
        let processed = unescapeDecorationEscapes(standardText).replace(
            URL_REGEX,
            (url) => {
                const placeholder = `%%URL_${urls.length}%%`;
                urls.push(url);
                return placeholder;
            },
        );
        processed = escapeHTML(processed);
        processed = replaceCustomEmoji(processed);
        processed = getEmoji(processed);

        processed = processed.replace(HASHTAG_REGEX, (_, tagName) =>
            `<a href="#search/${encodeURIComponent(tagName)}">#${getEmoji(tagName)}</a>`,
        );
        processed = processed.replace(MENTION_REGEX, (match, userId) => {
            const numericId = parseInt(userId, 10);
            const user = getCachedUser(numericId, userCache);
            if (user) {
                const userName = user.name || `user${numericId}`;
                return `<a href="#profile/${numericId}">@${getEmoji(escapeHTML(userName))}</a>`;
            }
            return match;
        });

        urls.forEach((url, index) => {
            const placeholder = `%%URL_${index}%%`;
            const safeUrl = getSafeHttpUrl(url);
            const displayUrl = decodeHtmlEntities(url);
            const link = safeUrl
                ? `<a href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(displayUrl)}</a>`
                : escapeHTML(displayUrl);
            processed = processed.replace(placeholder, link);
        });
        return processed.replace(/\n/g, '<br>');
    };

    const getDecorationStyle = () => {
        const styles = [];
        if (decoration.color) styles.push(`color:${decoration.color}`);
        if (decoration.size !== 1) styles.push(`font-size:${decoration.size}em`);
        if (decoration.rotate || decoration.x || decoration.y) {
            styles.push('display:inline-block');
            styles.push(
                `transform:translate(${decoration.x}em,${-decoration.y}em) rotate(${decoration.rotate}deg)`,
            );
            styles.push('transform-origin:center');
        }
        return styles.join(';');
    };

    const isValidDecorationDirective = (match) => {
        const isReset = match[0].startsWith('[/');
        if (isReset) {
            const resetName = match[1] ? resolveDecorationName(match[1]) : 'all';
            return Boolean(resetName);
        }
        const name = match[2] ? resolveDecorationName(match[2]) : null;
        return Boolean(name && parseDecorationValue(name, match[3]) !== null);
    };

    const renderDecorationSyntax = (standardText) => {
        let output = '';
        let previousIndex = 0;
        let match;
        DECORATION_DIRECTIVE_PATTERN.lastIndex = 0;
        while ((match = DECORATION_DIRECTIVE_PATTERN.exec(standardText)) !== null) {
            if (isEscapedDecorationStart(standardText, match.index)) continue;
            output += renderPlainText(standardText.slice(previousIndex, match.index));
            output += isValidDecorationDirective(match)
                ? renderSyntax(match[0])
                : renderPlainText(match[0]);
            previousIndex = DECORATION_DIRECTIVE_PATTERN.lastIndex;
        }
        return output + renderPlainText(standardText.slice(previousIndex));
    };

    const renderDecoratedText = (standardText) => {
        if (!allowContentDecorations) {
            return editorSyntax
                ? renderDecorationSyntax(standardText)
                : renderPlainText(standardText);
        }
        DECORATION_DIRECTIVE_PATTERN.lastIndex = 0;
        let output = '';
        let previousIndex = 0;
        let directiveCount = 0;
        let match;

        const renderSegment = (segment) => {
            if (!segment) return '';
            const rendered = renderPlainText(segment);
            const style = getDecorationStyle();
            return style
                ? `<span class="nyarkdown-decoration" style="${escapeHTML(style)}">${rendered}</span>`
                : rendered;
        };

        while ((match = DECORATION_DIRECTIVE_PATTERN.exec(standardText)) !== null) {
            if (isEscapedDecorationStart(standardText, match.index)) continue;
            output += renderSegment(standardText.slice(previousIndex, match.index));
            const isReset = match[0].startsWith('[/');
            const resetName = isReset ? (match[1] ? resolveDecorationName(match[1]) : 'all') : null;
            if (isReset && resetName) {
                if (resetName === 'all') {
                    Object.assign(decoration, decorationDefaults);
                } else {
                    decoration[resetName] = decorationDefaults[resetName];
                }
                output += renderSyntax(match[0]);
                previousIndex = DECORATION_DIRECTIVE_PATTERN.lastIndex;
                continue;
            }

            const name = match[2] ? resolveDecorationName(match[2]) : null;
            const parsedValue = name ? parseDecorationValue(name, match[3]) : null;
            if (name && parsedValue !== null && directiveCount < 24) {
                directiveCount += 1;
                decoration[name] = parsedValue;
                output += renderSyntax(match[0]);
                previousIndex = DECORATION_DIRECTIVE_PATTERN.lastIndex;
                continue;
            }

            output += renderSegment(match[0]);
            previousIndex = DECORATION_DIRECTIVE_PATTERN.lastIndex;
        }

        return output + renderSegment(standardText.slice(previousIndex));
    };

    if (!allowMarkdown) {
        return renderDecoratedText(text || '');
    }

    return renderLimitedMarkdown(text || '', {
        renderText: (chunk) => renderDecoratedText(chunk),
        renderLinkLabel: (label) => renderPlainText(label),
        sanitizeUrl: getSafeHttpUrl,
        renderSyntax,
    });
}

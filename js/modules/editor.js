import { getCurrentUser } from '../state.js';
import { customEmojiPromise, renderNyarkDown } from './nyarkdown.js';
import { applyServerInputLimits, scheduleNextFrame } from '../utils/helpers.js';
import { ICONS } from '../icons.js';

let nyaitterImeReadyPromise = null;
let nyaitterIme = null;
const NYAITTER_IME_STORAGE_KEY = 'nyaitter-ime-enabled';

function readNyaitterImePreference() {
    try { return localStorage.getItem(NYAITTER_IME_STORAGE_KEY) === 'true'; }
    catch (_) { return false; }
}

function saveNyaitterImePreference(enabled) {
    try { localStorage.setItem(NYAITTER_IME_STORAGE_KEY, String(enabled)); }
    catch (_) { /* Editing also works when storage is unavailable. */ }
}

function ensureNyaitterImeReady() {
    if (nyaitterIme) return Promise.resolve(nyaitterIme);
    if (nyaitterImeReadyPromise) return nyaitterImeReadyPromise;
    nyaitterImeReadyPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/gh/nyaitter/NyaitterIME@5578455f5acb6d0a580d0dfc56e1346671e8f698/dist/nyaitter-ime.min.js';
        script.onload = () => {
            const ime = globalThis.NyaitterIME;
            if (!ime?.ready) {
                reject(new Error('NyaitterIMEを初期化できませんでした'));
                return;
            }
            ime.ready.then(() => {
                nyaitterIme = ime;
                resolve(ime);
            }, reject);
        };
        script.onerror = () => reject(new Error('NyaitterIMEを読み込めませんでした'));
        document.head.append(script);
    }).catch((error) => {
        nyaitterImeReadyPromise = null;
        throw error;
    });
    return nyaitterImeReadyPromise;
}

export function normalizeMarkdownEditorValue(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n');
}

function isContentEditableEditor(editor) {
    return editor instanceof HTMLElement && editor.isContentEditable;
}

const DIRECT_EDITOR_BLOCK_TAGS = new Set([
    'P',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'BLOCKQUOTE',
    'PRE',
    'UL',
    'OL',
    'DIV',
]);

function shouldJoinDirectEditorChildrenWithNewline(node, children) {
    if (node instanceof Element && (node.tagName === 'UL' || node.tagName === 'OL')) {
        return true;
    }
    return (
        (node instanceof DocumentFragment || node instanceof HTMLElement) &&
        children.some(
            (child) =>
                child instanceof Element &&
                DIRECT_EDITOR_BLOCK_TAGS.has(child.tagName),
        )
    );
}

function isRenderedEmptyLinePlaceholder(node) {
    if (!(node instanceof Element)) {
        return false;
    }
    const isEmptyLineElement =
        node.classList.contains('markdown-empty-line') ||
        DIRECT_EDITOR_BLOCK_TAGS.has(node.tagName);
    if (!isEmptyLineElement) return false;
    return Array.from(node.childNodes).every((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
            return !(child.nodeValue || '').length;
        }
        return child instanceof HTMLBRElement;
    });
}

function serializeRubyBase(node) {
    return Array.from(node.childNodes)
        .filter(
            (child) =>
                !(child instanceof Element) ||
                !['RT', 'RP'].includes(child.tagName),
        )
        .map(serializeDirectEditorNode)
        .join('');
}

function getRenderedUnicodeEmojiSource(node) {
    if (!(node instanceof HTMLImageElement)) return null;
    if (!node.classList.contains('emoji')) return null;
    const source = node.getAttribute('alt');
    return source || null;
}

function serializeDirectEditorNode(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
    if (!(node instanceof Element || node instanceof DocumentFragment)) return '';
    if (node instanceof Element) {
        const unicodeEmoji = getRenderedUnicodeEmojiSource(node);
        if (unicodeEmoji !== null) return unicodeEmoji;
        if (node.classList.contains('markdown-editor-emoji')) {
            const id = node.dataset.emojiId || node.querySelector('img.nyaitter-emoji')?.dataset.emojiId || '';
            return `_${id}_`;
        }
        if (node.matches('ruby.markdown-ruby, ruby.nyarkdown-ruby, ruby.nyaitter-ime-ruby')) {
            return serializeRubyBase(node);
        }
        if (node.tagName === 'BR') {
            const parent = node.parentElement;
            // Browsers keep a trailing <br> as a caret placeholder after typing
            // into an empty contenteditable block. It is not a source newline.
            if (
                parent &&
                DIRECT_EDITOR_BLOCK_TAGS.has(parent.tagName) &&
                node === parent.lastChild &&
                parent.childNodes.length > 1
            ) {
                return '';
            }
            return '\n';
        }
        if (isRenderedEmptyLinePlaceholder(node)) return '';
        if (node.tagName === 'LI') {
            return Array.from(node.childNodes).map(serializeDirectEditorNode).join('');
        }
    }
    const children = Array.from(node.childNodes);
    const serialized = children.map(serializeDirectEditorNode);
    if (shouldJoinDirectEditorChildrenWithNewline(node, children)) {
        return serialized.join('\n');
    }
    return serialized.join('');
}

function serializeDirectEditorRange(editor, range) {
    const fragment = range.cloneContents();
    return normalizeMarkdownEditorValue(serializeDirectEditorNode(fragment));
}

function getDirectEditorSourceOffset(editor, container, offset) {
    const { segments } = getMarkdownEditorSourceSegments(editor);
    const element = container instanceof Element ? container : container?.parentElement;
    const emptyLine = element?.closest('.markdown-empty-line');
    if (emptyLine && editor.contains(emptyLine)) {
        const precedingNewline = segments.find(segment => segment.boundaryAfter?.container === emptyLine);
        if (precedingNewline) return precedingNewline.end;
        return 0;
    }
    const directSegment = segments.find((segment) => segment.node === container);
    if (directSegment) {
        return directSegment.start + Math.max(
            0,
            Math.min(Number(offset) || 0, directSegment.length || 0),
        );
    }
    for (const segment of segments) {
        if (segment.boundaryAfter?.container === container && segment.boundaryAfter.offset === offset) {
            return segment.end;
        }
        if (segment.boundaryBefore?.container === container && segment.boundaryBefore.offset === offset) {
            return segment.start;
        }
    }
    return null;
}

export function getMarkdownEditorValue(editor) {
    if (editor instanceof HTMLTextAreaElement) {
        return normalizeMarkdownEditorValue(editor.value);
    }
    if (editor instanceof HTMLElement) {
        if (editor.dataset.directContentEditor === 'true' && editor._markdownPreviewEnabled) {
            return normalizeMarkdownEditorValue(editor._markdownEditorSource || '');
        }
        const value = normalizeMarkdownEditorValue(serializeDirectEditorNode(editor));
        // Chromium keeps a <br> or <div><br></div> in an emptied contenteditable.
        // Treat those browser-only placeholders as an actually empty editor.
        return /^\n*$/.test(value) ? '' : value;
    }
    return '';
}

function getContentEditableSelection(editor) {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
        const length = getMarkdownEditorValue(editor).length;
        return { start: length, end: length, direction: 'none' };
    }
    const range = selection.getRangeAt(0);
    const directStart = getDirectEditorSourceOffset(
        editor,
        range.startContainer,
        range.startOffset,
    );
    const directEnd = getDirectEditorSourceOffset(
        editor,
        range.endContainer,
        range.endOffset,
    );
    if (directStart !== null && directEnd !== null) {
        return {
            start: directStart,
            end: directEnd,
            direction: 'none',
        };
    }
    const startRange = document.createRange();
    startRange.selectNodeContents(editor);
    startRange.setEnd(range.startContainer, range.startOffset);
    const endRange = document.createRange();
    endRange.selectNodeContents(editor);
    endRange.setEnd(range.endContainer, range.endOffset);
    return {
        start: serializeDirectEditorRange(editor, startRange).length,
        end: serializeDirectEditorRange(editor, endRange).length,
        direction: 'none',
    };
}

function setContentEditableSelection(editor, start, end = start) {
    const startBoundary = getMarkdownEditorBoundary(editor, start);
    const endBoundary = getMarkdownEditorBoundary(editor, end);
    if (!startBoundary?.container || !endBoundary?.container) return;
    const range = document.createRange();
    range.setStart(startBoundary.container, startBoundary.offset);
    range.setEnd(endBoundary.container, endBoundary.offset);
    const selection = window.getSelection?.();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function getDirectEditorDeleteCaret(editor, inputType, selection) {
    if (!selection) return null;
    if (selection.start !== selection.end) return selection.start;
    if (inputType !== 'deleteContentBackward') return selection.start;

    const { segments } = getMarkdownEditorSourceSegments(editor);
    const previousSegment = segments.find(
        (segment) =>
            segment.end === selection.start &&
            segment.node instanceof Element &&
            segment.node.classList.contains('markdown-editor-emoji'),
    );
    if (previousSegment) return previousSegment.start;
    return Math.max(0, selection.start - 1);
}

function renderDirectContentEditor(editor, selection = null) {
    if (!(editor instanceof HTMLElement) || editor._markdownPreviewEnabled) return;
    const value = getMarkdownEditorValue(editor);
    const snapshot = selection || getContentEditableSelection(editor);
    editor.innerHTML = value
        ? renderNyarkDown(value, new Map(), {
              allowMarkdown: true,
              editorSyntax: true,
              allowContentDecorations: false,
          })
        : '';
    if (!value) {
        editor.replaceChildren();
    }
    editor.classList.toggle('is-logically-empty', !value);
    editor.querySelectorAll('ruby rt, ruby rp').forEach((rubyAnnotation) => {
        rubyAnnotation.contentEditable = 'false';
        rubyAnnotation.setAttribute('aria-hidden', 'true');
    });
    setContentEditableSelection(editor, snapshot.start, snapshot.end);
    decorateNyaitterImeComposition(editor);
    if (editor._nyaitterImeComposition?.active) {
        setContentEditableSelection(editor, snapshot.start, snapshot.end);
    }
}

function decorateNyaitterImeComposition(editor) {
    const composition = editor._nyaitterImeComposition;
    if (!composition?.active || composition.start >= composition.end) return;
    const { segments } = getMarkdownEditorSourceSegments(editor);
    const textSegments = segments.filter(segment => segment.node?.nodeType === Node.TEXT_NODE &&
        segment.end > composition.start && segment.start < composition.end);
    // Wrap inline text only. Extracting a range across paragraph boundaries
    // moves empty-line blocks into ruby and loses their source newline.
    for (let index = textSegments.length - 1; index >= 0; index -= 1) {
    const segment = textSegments[index];
    try {
        const range = document.createRange();
        range.setStart(segment.node, Math.max(0, composition.start - segment.start));
        range.setEnd(segment.node, Math.min(segment.length, composition.end - segment.start));
        if (!range.toString()) return;
        const ruby = document.createElement('ruby');
        ruby.className = 'nyaitter-ime-ruby';
        ruby.append(range.extractContents());
        const rt = document.createElement('rt');
        rt.textContent = index === textSegments.length - 1 ? composition.source : '';
        rt.contentEditable = 'false';
        rt.setAttribute('aria-hidden', 'true');
        ruby.append(rt);
        range.insertNode(ruby);
    } catch (_) {
        continue;
    }
    }
}

function updateNyaitterImeButton(button, enabled) {
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled ? 'Nyaitter IME: オン' : 'Nyaitter IME: オフ';
    button.setAttribute('aria-label', button.title);
}

function commitNyaitterImeComposition(editor) {
    const composition = editor?._nyaitterImeComposition;
    if (!composition?.active) return;
    delete editor._nyaitterImeComposition;
    renderDirectContentEditor(editor, {
        start: composition.end,
        end: composition.end,
    });
    autoResizeMarkdownEditor(editor);
}

function removeNyaitterImeSelection(editor, start, end) {
    delete editor._nyaitterImeComposition;
    replaceMarkdownEditorRange(editor, '', start, end, 'end');
    autoResizeMarkdownEditor(editor);
}

function applyNyaitterImeComposition(editor, composition, ime) {
    if (editor._nyaitterImeComposition !== composition || !composition.active) return;
    if (ime && !composition.session) composition.session = ime.createSession({
        ignoredTexts: ['*', '#', '_', '~', '`', '[', ']', '(', ')', '{', '}', '>', '|', '\\'],
        customDictionary: [
            { reading: 'にゃいったー', surface: 'Nyaitter' },
            { reading: 'あってん', surface: 'Atten' },
            { reading: 'すくらっちゃー', surface: 'Scratcher' },
            { reading: 'ぶいあーるちゃっと', surface: 'VRChat' },
            { reading: 'ゔいあーるちゃっと', surface: 'VRChat' },
            { reading: 'ちゃっぴー', surface: 'ChatGPT' },
        ],
    });
    const converted = composition.source ? (ime ? composition.session.convert(composition.source) : composition.source) : '';
    const previousEnd = composition.end;
    composition.converted = converted;
    composition.end = composition.start + converted.length;
    replaceMarkdownEditorRange(
        editor,
        converted,
        composition.start,
        previousEnd,
        'select',
    );
    autoResizeMarkdownEditor(editor);
}

function handleNyaitterImeBeforeInput(editor, event) {
    const activeComposition = editor._nyaitterImeComposition;
    if (activeComposition?.active && event.inputType === 'deleteContentBackward') {
        event.preventDefault();
        activeComposition.source = Array.from(activeComposition.source).slice(0, -1).join('');
        if (!activeComposition.source) {
            activeComposition.active = false;
            activeComposition.session?.reset();
            removeNyaitterImeSelection(editor, activeComposition.start, activeComposition.end);
            return;
        }
        applyNyaitterImeComposition(editor, activeComposition, nyaitterIme);
        return;
    }
    if (activeComposition?.active && event.inputType?.startsWith('delete')) {
        event.preventDefault();
        const selection = getContentEditableSelection(editor);
        const start = selection.start === activeComposition.start && selection.end === activeComposition.end
            ? activeComposition.start
            : selection.start;
        const end = selection.start === activeComposition.start && selection.end === activeComposition.end
            ? activeComposition.end
            : selection.end;
        removeNyaitterImeSelection(editor, start, end);
        return;
    }
    if (!editor._nyaitterImeEnabled || event.inputType !== 'insertText' || !event.data || event.isComposing) return;

    event.preventDefault();
    const selection = getContentEditableSelection(editor);
    let composition = editor._nyaitterImeComposition;
    if (
        !composition?.active ||
        selection.start !== composition.start ||
        selection.end !== composition.end
    ) {
        composition = {
            active: true,
            start: selection.start,
            end: selection.end,
            source: '',
            converted: '',
        };
    }
    composition.source += event.data;
    editor._nyaitterImeComposition = composition;

    if (nyaitterIme) {
        applyNyaitterImeComposition(editor, composition, nyaitterIme);
        return;
    }

    const previousEnd = composition.end;
    composition.converted = composition.source;
    composition.end = composition.start + composition.source.length;
    replaceMarkdownEditorRange(
        editor,
        composition.source,
        composition.start,
        previousEnd,
        'select',
    );
    void ensureNyaitterImeReady()
        .then((ime) => applyNyaitterImeComposition(editor, composition, ime))
        .catch(() => {
            editor._nyaitterImeEnabled = false;
            delete editor._nyaitterImeComposition;
            const button = editor
                .closest('.markdown-textarea-editor')
                ?.parentElement?.querySelector('.nyaitter-ime-button');
            if (button) {
                updateNyaitterImeButton(button, false);
                button.title = 'NyaitterIMEを読み込めませんでした';
                button.setAttribute('aria-label', button.title);
            }
            renderDirectContentEditor(editor);
        });
}

function convertTextareaToDirectEditor(textarea) {
    const editor = document.createElement('div');
    const placeholder =
        textarea.dataset.markdownPlaceholder ??
        textarea.getAttribute('placeholder') ??
        '';
    editor.id = textarea.id;
    editor.className = textarea.className;
    Array.from(textarea.attributes).forEach((attribute) => {
        if (['id', 'class', 'rows', 'placeholder'].includes(attribute.name)) return;
        editor.setAttribute(attribute.name, attribute.value);
    });
    editor.contentEditable = 'true';
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.spellcheck = textarea.spellcheck;
    editor.dataset.markdownPlaceholder = placeholder;
    editor.dataset.placeholder = placeholder;
    editor.dataset.directContentEditor = 'true';
    editor.textContent = normalizeMarkdownEditorValue(textarea.value);
    const host = textarea.closest('.markdown-textarea-editor');
    textarea.replaceWith(editor);
    host?.querySelector('.markdown-editor-paint')?.remove();
    return editor;
}

function replaceMarkdownEditorRange(editor, replacement, start, end, selectionMode = 'end') {
    delete editor._directEditorBeforeInput;
    const value = getMarkdownEditorValue(editor);
    const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    editor.textContent = next;
    const replacementEnd = start + replacement.length;
    const selectionStart = selectionMode === 'select' ? start : replacementEnd;
    setContentEditableSelection(editor, selectionStart, replacementEnd);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function enforceDirectEditorMaxLength(editor) {
    const maxLength = Number(editor.getAttribute('maxlength'));
    if (!Number.isInteger(maxLength) || maxLength < 0) return;
    const value = getMarkdownEditorValue(editor);
    if (value.length <= maxLength) return;
    const selection = getContentEditableSelection(editor);
    editor.textContent = value.slice(0, maxLength);
    const caret = Math.min(selection.start, maxLength);
    setContentEditableSelection(editor, caret);
}

export function getMarkdownEditorPreview(editor) {
    return editor?.parentElement?.querySelector?.('.markdown-editor-preview') || null;
}

export function getMarkdownEditorPaint(editor) {
    return editor?.parentElement?.querySelector?.('.markdown-editor-paint') || null;
}

export function getMarkdownEditorSourceLength(node) {
    if (!node) return 0;
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.length;
    if (node instanceof Element) {
        const unicodeEmoji = getRenderedUnicodeEmojiSource(node);
        if (unicodeEmoji !== null) return unicodeEmoji.length;
        if (node.classList.contains('markdown-syntax')) return node.textContent.length;
        if (node.classList.contains('markdown-editor-emoji')) {
            const id = node.dataset.emojiId || node.querySelector('img.nyaitter-emoji')?.dataset.emojiId || '';
            return id.length + 2;
        }
        if (node.matches('ruby.markdown-ruby, ruby.nyarkdown-ruby, ruby.nyaitter-ime-ruby')) {
            return Array.from(node.childNodes)
                .filter(
                    (child) =>
                        !(child instanceof Element) ||
                        !['RT', 'RP'].includes(child.tagName),
                )
                .reduce(
                    (total, child) => total + getMarkdownEditorSourceLength(child),
                    0,
                );
        }
        if (node.tagName === 'BR') return 1;
        let total = 0;
        node.childNodes.forEach((child) => {
            total += getMarkdownEditorSourceLength(child);
        });
        return total;
    }
    return 0;
}

export function getMarkdownEditorSourceSegments(root) {
    const segments = [];
    let currentPosition = 0;

    const getNodeStartBoundary = (node) => {
        if (node?.nodeType === Node.TEXT_NODE) {
            return { container: node, offset: 0 };
        }
        if (node instanceof Element) {
            return { container: node, offset: 0 };
        }
        return null;
    };

    const getNodeEndBoundary = (node) => {
        if (node?.nodeType === Node.TEXT_NODE) {
            return { container: node, offset: node.nodeValue?.length || 0 };
        }
        if (node instanceof Element) {
            if (isRenderedEmptyLinePlaceholder(node)) {
                return { container: node, offset: 0 };
            }
            return { container: node, offset: node.childNodes.length };
        }
        return null;
    };

    const appendVirtualNewline = (container, childIndex, previousChild, nextChild) => {
        segments.push({
            node: null,
            start: currentPosition,
            end: currentPosition + 1,
            length: 1,
            boundaryBefore:
                getNodeEndBoundary(previousChild) ||
                { container, offset: childIndex },
            boundaryAfter:
                getNodeStartBoundary(nextChild) ||
                { container, offset: childIndex + 1 },
        });
        currentPosition += 1;
    };

    const traverse = (node) => {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
            const length = node.nodeValue.length;
            if (length > 0) {
                segments.push({
                    node,
                    start: currentPosition,
                    end: currentPosition + length,
                    length,
                });
                currentPosition += length;
            }
            return;
        }

        if (node instanceof Element) {
            if (isRenderedEmptyLinePlaceholder(node)) return;
            const unicodeEmoji = getRenderedUnicodeEmojiSource(node);
            if (unicodeEmoji !== null) {
                const emojiParent = node.parentNode;
                const emojiIndex = emojiParent
                    ? Array.from(emojiParent.childNodes).indexOf(node)
                    : -1;
                if (emojiParent && emojiIndex >= 0) {
                    segments.push({
                        node,
                        start: currentPosition,
                        end: currentPosition + unicodeEmoji.length,
                        length: unicodeEmoji.length,
                        boundaryBefore: { container: emojiParent, offset: emojiIndex },
                        boundaryAfter: { container: emojiParent, offset: emojiIndex + 1 },
                    });
                }
                currentPosition += unicodeEmoji.length;
                return;
            }
            if (node.classList.contains('markdown-editor-emoji')) {
                const idText = node.dataset.emojiId || node.querySelector('img.nyaitter-emoji')?.dataset.emojiId || '';
                const tokenLength = idText.length + 2;
                const tokenParent = node.parentNode;
                const tokenIndex = tokenParent
                    ? Array.from(tokenParent.childNodes).indexOf(node)
                    : -1;
                if (tokenParent && tokenIndex >= 0) {
                    segments.push({
                        node,
                        start: currentPosition,
                        end: currentPosition + tokenLength,
                        length: tokenLength,
                        boundaryBefore: { container: tokenParent, offset: tokenIndex },
                        boundaryAfter: { container: tokenParent, offset: tokenIndex + 1 },
                    });
                }
                currentPosition += tokenLength;
                return;
            }

            if (node.matches('ruby.markdown-ruby, ruby.nyarkdown-ruby, ruby.nyaitter-ime-ruby')) {
                Array.from(node.childNodes)
                    .filter(
                        (child) =>
                            !(child instanceof Element) ||
                            !['RT', 'RP'].includes(child.tagName),
                    )
                    .forEach(traverse);
                return;
            }

            if (node.tagName === 'BR') {
                const parent = node.parentNode;
                const index = parent ? Array.from(parent.childNodes).indexOf(node) : -1;
                segments.push({
                    node,
                    start: currentPosition,
                    end: currentPosition + 1,
                    length: 1,
                    ...(index >= 0 ? {
                        boundaryBefore: { container: parent, offset: index },
                        boundaryAfter: { container: parent, offset: index + 1 },
                    } : {}),
                });
                currentPosition += 1;
                return;
            }
        }

        if (!(node instanceof Element || node instanceof DocumentFragment)) return;
        const children = Array.from(node.childNodes);
        const joinWithNewline = shouldJoinDirectEditorChildrenWithNewline(node, children);
        children.forEach((child, index) => {
            traverse(child);
            if (joinWithNewline && index < children.length - 1) {
                appendVirtualNewline(
                    node,
                    index + 1,
                    child,
                    children[index + 1],
                );
            }
        });
    };

    traverse(root);
    return { segments, totalLength: currentPosition };
}

export function getMarkdownEditorSegmentBoundary(segment, offset) {
    if (!segment) return null;
    const clampedOffset = Math.max(
        0,
        Math.min(offset, segment.length || 0),
    );

    if (segment.boundaryBefore && segment.boundaryAfter) {
        return clampedOffset === 0
            ? segment.boundaryBefore
            : segment.boundaryAfter;
    }

    if (segment.node?.nodeType === Node.TEXT_NODE) {
        return {
            container: segment.node,
            offset: clampedOffset,
        };
    }

    if (segment.node instanceof Element) {
        const parent = segment.node.parentNode;
        if (!parent) return null;
        const index = Array.from(parent.childNodes).indexOf(segment.node);
        if (index === -1) return null;
        return {
            container: parent,
            offset: clampedOffset === 0 ? index : index + 1,
        };
    }

    return null;
}

export function getMarkdownEditorBoundary(root, targetOffset) {
    if (!root) return null;
    const { segments, totalLength } = getMarkdownEditorSourceSegments(root);
    const clamped = Math.max(0, Math.min(targetOffset, totalLength));

    if (segments.length === 0) {
        return { container: root, offset: 0 };
    }

    for (const segment of segments) {
        if (clamped >= segment.start && clamped <= segment.end) {
            return getMarkdownEditorSegmentBoundary(
                segment,
                clamped - segment.start,
            );
        }
    }

    const last = segments[segments.length - 1];
    return getMarkdownEditorSegmentBoundary(last, last.length);
}

export function getMarkdownEditorCaretRect(preview, offset) {
    if (!preview) return null;
    const boundary = getMarkdownEditorBoundary(preview, offset);
    if (!boundary?.container) return null;

    try {
        const range = document.createRange();
        range.setStart(boundary.container, boundary.offset);
        range.collapse(true);
        const rects = range.getClientRects();
        if (rects.length > 0) return rects[0];
        const bounds = range.getBoundingClientRect();
        if (bounds && (bounds.width > 0 || bounds.height > 0)) return bounds;
    } catch (_) {}

    return null;
}

export function getMarkdownEditorSelectionRects(preview, start, end) {
    if (!preview || start >= end) return [];
    const startBoundary = getMarkdownEditorBoundary(preview, start);
    const endBoundary = getMarkdownEditorBoundary(preview, end);
    if (!startBoundary?.container || !endBoundary?.container) return [];

    try {
        const range = document.createRange();
        range.setStart(startBoundary.container, startBoundary.offset);
        range.setEnd(endBoundary.container, endBoundary.offset);
        return Array.from(range.getClientRects());
    } catch (_) {
        return [];
    }
}

export function getMarkdownEditorSelectionSnapshot(editor) {
    if (isContentEditableEditor(editor)) {
        return getContentEditableSelection(editor);
    }
    return {
        start: editor?.selectionStart ?? 0,
        end: editor?.selectionEnd ?? 0,
        direction: editor?.selectionDirection ?? 'none',
    };
}

export function getMarkdownEditorCompositionRange(editor) {
    const active = editor?._markdownEditorComposition?.active;
    if (!active) return null;
    const start = editor._markdownEditorComposition.start;
    const data = editor._markdownEditorComposition.data || '';
    return {
        start,
        end: start + data.length,
    };
}

export function getMarkdownEditorSelectedCompositionClause(editor, composition) {
    if (!composition) return null;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (start === end) return null;
    if (start < composition.start || end > composition.end) return null;
    return { start, end };
}

export function appendMarkdownEditorRect(layer, className, rect, paintRect) {
    const element = document.createElement('span');
    element.className = className;
    element.style.left = `${rect.left - paintRect.left}px`;
    element.style.top = `${rect.top - paintRect.top}px`;
    element.style.width = `${Math.max(rect.width, 1)}px`;
    element.style.height = `${rect.height}px`;
    layer.append(element);
}

export function syncMarkdownEditorCompositionDecoration(editor, preview, paint) {
    const layer = paint.querySelector('.markdown-editor-composition');
    if (!layer) return;
    layer.replaceChildren();
    const composition = getMarkdownEditorCompositionRange(editor);
    if (!composition) return;
    const paintRect = paint.getBoundingClientRect();
    getMarkdownEditorSelectionRects(
        preview,
        composition.start,
        composition.end,
    ).forEach((rect) => {
        appendMarkdownEditorRect(
            layer,
            'markdown-editor-composition-underline',
            rect,
            paintRect,
        );
    });

    const selectedClause = getMarkdownEditorSelectedCompositionClause(
        editor,
        composition,
    );
    if (!selectedClause) return;
    getMarkdownEditorSelectionRects(
        preview,
        selectedClause.start,
        selectedClause.end,
    ).forEach((rect) => {
        appendMarkdownEditorRect(
            layer,
            'markdown-editor-selection-rect',
            rect,
            paintRect,
        );
    });
}

export function syncMarkdownEditorEmojiLabels(editor, preview, selection) {
    // Completed custom emoji are atomic editor tokens and stay icon-only.
}

export function syncMarkdownEditorDecoration(editor) {
    const preview = getMarkdownEditorPreview(editor);
    const paint = getMarkdownEditorPaint(editor);
    if (!preview || !paint) return;
    const selectionLayer = paint.querySelector('.markdown-editor-selection');
    const caret = paint.querySelector('.markdown-editor-caret');
    if (!selectionLayer || !caret) return;

    const selection = getMarkdownEditorSelectionSnapshot(editor);
    const expectedMode =
        selection.start === selection.end &&
        !editor._markdownEditorComposition?.active
            ? 'formatted'
            : 'raw';
    if (preview.dataset.markdownEditorMode !== expectedMode) {
        updateMarkdownEditorPreview(editor, selection);
        return;
    }
    syncMarkdownEditorEmojiLabels(editor, preview, selection);
    paint.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
    selectionLayer.replaceChildren();
    syncMarkdownEditorCompositionDecoration(editor, preview, paint);
    caret.hidden = true;

    if (document.activeElement !== editor) return;

    const { start, end } = selection;
    const paintRect = paint.getBoundingClientRect();
    if (start !== end) {
        getMarkdownEditorSelectionRects(preview, start, end).forEach((rect) => {
            appendMarkdownEditorRect(
                selectionLayer,
                'markdown-editor-selection-rect',
                rect,
                paintRect,
            );
        });
        return;
    }

    const rect = getMarkdownEditorCaretRect(preview, start);
    if (!rect || rect.height === 0) return;
    caret.hidden = false;
    caret.style.left = `${rect.left - paintRect.left}px`;
    caret.style.top = `${rect.top - paintRect.top}px`;
    caret.style.height = `${rect.height}px`;
}

export function autoResizeMarkdownEditor(editor) {
    if (!(editor instanceof HTMLElement)) return;
    const host = editor.closest('.markdown-textarea-editor');
    if (isContentEditableEditor(editor)) {
        editor.style.height = 'auto';
        if (host) {
            host.style.height = 'auto';
            host.style.minHeight = window.getComputedStyle(editor).minHeight || '60px';
        }
        return;
    }
    if (!(editor instanceof HTMLTextAreaElement)) return;
    const preview = getMarkdownEditorPreview(editor);
    const paint = getMarkdownEditorPaint(editor);

    editor.style.height = 'auto';
    const computed = window.getComputedStyle(editor);
    const minHeight = parseFloat(computed.minHeight) || 60;

    let targetHeight = Math.max(editor.scrollHeight, minHeight);

    if (editor._markdownPreviewEnabled && preview) {
        const previewHeight = preview.scrollHeight || preview.offsetHeight || 0;
        targetHeight = Math.max(targetHeight, previewHeight, minHeight);
    }

    editor.style.height = `${targetHeight}px`;
    if (host) {
        host.style.height = `${targetHeight}px`;
        host.style.minHeight = `${minHeight}px`;
    }
    if (preview) {
        preview.style.minHeight = `${targetHeight}px`;
    }
    if (paint) {
        paint.style.height = `${targetHeight}px`;
    }
}

export function syncMarkdownEditorPreviewHeight(editor, preview) {
    autoResizeMarkdownEditor(editor);
}

export function setMarkdownEditorPreview(preview, html, mode) {
    if (!preview) return;
    preview.dataset.markdownEditorMode = mode;
    preview.innerHTML = html;
}

export function toggleMarkdownEditorPreview(editor) {
    if (!(editor instanceof HTMLElement)) return;
    const host = editor.closest('.markdown-textarea-editor');
    if (!host) return;
    const previewEnabled = !editor._markdownPreviewEnabled;
    if (previewEnabled) commitNyaitterImeComposition(editor);
    const directEditorSource =
        previewEnabled && editor.dataset.directContentEditor === 'true'
            ? getMarkdownEditorValue(editor)
            : null;

    editor._markdownPreviewEnabled = previewEnabled;
    const toolbarContainer = host.closest('.post-form, .form-content, .dm-message-form');
    const emojiButton = toolbarContainer?.querySelector('.emoji-pic-button');
    const imeButton = toolbarContainer?.querySelector('.nyaitter-ime-button');
    if (previewEnabled) {
        delete editor._markdownEditorComposition;
        editor._nyaitterImeWasEnabled = Boolean(editor._nyaitterImeEnabled);
        editor._nyaitterImeEnabled = false;
        if (imeButton) {
            imeButton.disabled = true;
            updateNyaitterImeButton(imeButton, false);
        }
        if (emojiButton) {
            editor._markdownPreviewEmojiWasDisabled = emojiButton.disabled;
            emojiButton.disabled = true;
        }
    } else {
        editor._nyaitterImeEnabled = Boolean(editor._nyaitterImeWasEnabled);
        delete editor._nyaitterImeWasEnabled;
        if (imeButton) {
            imeButton.disabled = false;
            updateNyaitterImeButton(imeButton, editor._nyaitterImeEnabled);
        }
        if (emojiButton) {
            emojiButton.disabled = Boolean(editor._markdownPreviewEmojiWasDisabled);
            delete editor._markdownPreviewEmojiWasDisabled;
        }
    }
    if (isContentEditableEditor(editor) || editor.dataset.directContentEditor === 'true') {
        if (previewEnabled) {
            editor._markdownEditorSource = normalizeMarkdownEditorValue(
                directEditorSource ?? getMarkdownEditorValue(editor),
            );
            editor.contentEditable = 'false';
            editor.classList.remove('is-logically-empty');
            editor.innerHTML = editor._markdownEditorSource
                ? renderNyarkDown(editor._markdownEditorSource, new Map(), {
                      allowMarkdown: true,
                      editorSyntax: false,
                      allowContentDecorations: true,
                  })
                : '';
        } else {
            editor.textContent = normalizeMarkdownEditorValue(editor._markdownEditorSource || '');
            editor.contentEditable = 'true';
            delete editor._markdownEditorSource;
            renderDirectContentEditor(editor);
        }
    } else {
        editor.disabled = previewEnabled;
    }
    host.classList.toggle('is-markdown-previewing', previewEnabled);
    const button = toolbarContainer?.querySelector('.markdown-preview-button');
    if (button) {
        button.classList.toggle('active', previewEnabled);
        button.title = previewEnabled ? '編集に戻る' : 'プレビューを表示';
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-pressed', String(previewEnabled));
    }
    if (!editor.dataset.directContentEditor) {
        updateMarkdownEditorPreview(editor, undefined, { published: previewEnabled });
    }
    if (!previewEnabled) {
        editor.focus();
        scheduleNextFrame(() => {
            syncMarkdownEditorDecoration(editor);
            autoResizeMarkdownEditor(editor);
        });
    }
}

export function setupMarkdownEditorPreviewButton(container, editor) {
    if (!container || !(editor instanceof HTMLElement)) return;
    let previewButton = container.querySelector('.markdown-preview-button');
    if (!previewButton) {
        previewButton = document.createElement('button');
        previewButton.type = 'button';
        previewButton.className = 'markdown-preview-button float-left';
        previewButton.innerHTML = ICONS.preview;
        previewButton.title = 'プレビューを表示';
        previewButton.setAttribute('aria-label', 'プレビューを表示');
        previewButton.setAttribute('aria-pressed', 'false');
        const emojiButton = container.querySelector('.emoji-pic-button');
        if (emojiButton) {
            emojiButton.insertAdjacentElement('afterend', previewButton);
        } else {
            const actions = container.querySelector('.post-form-actions, .dm-form-actions');
            if (actions) actions.prepend(previewButton);
        }
        previewButton.addEventListener('click', () => {
            const picker = container.querySelector('#emoji-picker');
            if (picker) picker.classList.add('hidden');
            toggleMarkdownEditorPreview(editor);
        });
    }

    const host = editor.closest('.markdown-textarea-editor');
    const imeEnabledForEditor = host?.classList.contains('is-nyaitter-editor');
    let imeButton = container.querySelector('.nyaitter-ime-button');
    if (!imeEnabledForEditor) {
        imeButton?.remove();
        editor._nyaitterImeEnabled = false;
        commitNyaitterImeComposition(editor);
        return;
    }
    if (imeButton) return;

    imeButton = document.createElement('button');
    imeButton.type = 'button';
    imeButton.className = 'nyaitter-ime-button float-left';
    imeButton.innerHTML = ICONS.ime;
    editor._nyaitterImeEnabled = readNyaitterImePreference();
    updateNyaitterImeButton(imeButton, editor._nyaitterImeEnabled);
    const loadImeAssets = async () => {
        imeButton.setAttribute('aria-busy', 'true');
        imeButton.innerHTML = '<span class="nyaitter-ime-spinner" aria-hidden="true"></span>';
        try {
            const ime = await ensureNyaitterImeReady();
            if (editor._nyaitterImeComposition?.active) {
                applyNyaitterImeComposition(editor, editor._nyaitterImeComposition, ime);
            }
        } catch (_) {
            editor._nyaitterImeEnabled = false;
            updateNyaitterImeButton(imeButton, false);
            imeButton.title = 'NyaitterIMEを読み込めませんでした';
            imeButton.setAttribute('aria-label', imeButton.title);
        } finally {
            imeButton.removeAttribute('aria-busy');
            imeButton.innerHTML = ICONS.ime;
        }
    };
    imeButton.addEventListener('pointerdown', (event) => event.preventDefault());
    imeButton.addEventListener('click', async () => {
        const enabled = !editor._nyaitterImeEnabled;
        editor._nyaitterImeEnabled = enabled;
        saveNyaitterImePreference(enabled);
        updateNyaitterImeButton(imeButton, enabled);
        if (!enabled) {
            commitNyaitterImeComposition(editor);
            editor.focus();
            return;
        }
        await loadImeAssets();
        editor.focus();
    });
    previewButton.insertAdjacentElement('afterend', imeButton);
    if (editor._nyaitterImeEnabled && !nyaitterIme) void loadImeAssets();
}

export function updateMarkdownEditorPreview(
    editor,
    selectionSnapshot = null,
    { published = false } = {},
) {
    const preview = getMarkdownEditorPreview(editor);
    if (!preview) return;
    const selection = selectionSnapshot || getMarkdownEditorSelectionSnapshot(editor);
    const rawValue = getMarkdownEditorValue(editor);
    const rawTextMode =
        !published &&
        (selection.start !== selection.end ||
            Boolean(editor._markdownEditorComposition?.active));
    const mode = published ? 'published' : rawTextMode ? 'raw' : 'formatted';

    if (rawTextMode) {
        preview.textContent = rawValue;
    } else {
        preview.innerHTML = rawValue
            ? renderNyarkDown(rawValue, new Map(), {
                  allowMarkdown: true,
                  editorSyntax: !published,
                  allowContentDecorations: published,
              })
            : '';
    }
    preview.classList.remove('hidden');
    preview.dataset.markdownEditorMode = mode;

    const placeholder = getMarkdownEditorPaint(editor)?.querySelector(
        '.markdown-editor-placeholder',
    );
    if (placeholder) {
        placeholder.textContent = editor.dataset.markdownPlaceholder || '';
        placeholder.hidden = published || Boolean(rawValue);
    }

    autoResizeMarkdownEditor(editor);

    if (published) {
        scheduleNextFrame(() => autoResizeMarkdownEditor(editor));
    } else {
        scheduleNextFrame(() => {
            syncMarkdownEditorDecoration(editor);
            autoResizeMarkdownEditor(editor);
        });
    }
}

export function getContentEditorPreference() {
    return getCurrentUser()?.settings?.content_editor !== 'textarea';
}

export function applyContentEditorPreference(editor) {
    if (!(editor instanceof HTMLElement)) return false;
    const container = editor.closest('.markdown-textarea-editor');
    const enabled = getContentEditorPreference();
    if (!container) return enabled;
    if (editor.dataset.markdownPlaceholder === undefined) {
        editor.dataset.markdownPlaceholder = editor.dataset.placeholder || editor.placeholder || '';
    }
    container.classList.toggle('is-plain-textarea', !enabled);
    container.classList.toggle('is-nyaitter-editor', enabled);
    if (editor instanceof HTMLTextAreaElement) {
        editor.placeholder = enabled ? '' : editor.dataset.markdownPlaceholder || '';
    } else {
        editor.dataset.placeholder = editor.dataset.markdownPlaceholder || '';
    }
    return enabled;
}

export function refreshMarkdownContentEditors(root = document) {
    const selector = '[data-markdown-content-editor]';
    const editors = [];
    if (root instanceof HTMLElement && root.matches(selector)) {
        editors.push(root);
    }
    if (root?.querySelectorAll) {
        editors.push(...root.querySelectorAll(selector));
    }
    editors.forEach((editor) => {
        applyContentEditorPreference(editor);
        if (editor.dataset.markdownContentEditor === 'true') {
            updateMarkdownEditorPreview(editor);
        }
    });
}

// Single global selectionchange listener to avoid leaking listeners
let globalSelectionChangeBound = false;
function ensureGlobalSelectionChangeListener() {
    if (globalSelectionChangeBound) return;
    globalSelectionChangeBound = true;
    document.addEventListener('selectionchange', () => {
        const active = document.activeElement;
        if (active instanceof HTMLTextAreaElement && active.dataset.markdownContentEditor === 'true') {
            syncMarkdownEditorDecoration(active);
        }
    });
}

export function attachMarkdownContentEditor(editor) {
    if (!(editor instanceof HTMLElement)) return editor;
    applyServerInputLimits(editor);
    const useNyaitterEditor = applyContentEditorPreference(editor);
    if (editor instanceof HTMLTextAreaElement && useNyaitterEditor) {
        editor = convertTextareaToDirectEditor(editor);
    }
    if (isContentEditableEditor(editor)) {
        editor.dataset.directContentEditor = 'true';
        editor.dataset.markdownContentEditor = 'true';
        editor.spellcheck = true;
        ensureGlobalSelectionChangeListener();
        if (!Object.prototype.hasOwnProperty.call(editor, 'disabled')) {
            let disabled = false;
            Object.defineProperty(editor, 'disabled', {
                configurable: true,
                get: () => disabled,
                set: (value) => {
                    disabled = Boolean(value);
                    editor.contentEditable = disabled ? 'false' : 'true';
                    editor.setAttribute('aria-disabled', String(disabled));
                },
            });
        }
        if (editor.dataset.directEditorBound !== 'true') {
            editor.dataset.directEditorBound = 'true';
            editor.addEventListener('beforeinput', (event) => {
                const selection = getContentEditableSelection(editor);
                editor._directEditorBeforeInput = {
                    inputType: event.inputType || '',
                    selection,
                    deleteCaret: event.inputType?.startsWith('delete')
                        ? getDirectEditorDeleteCaret(editor, event.inputType, selection)
                        : null,
                };
                handleNyaitterImeBeforeInput(editor, event);
            });
            editor.addEventListener('keydown', (event) => {
                if (event.defaultPrevented) return;
                if (
                    editor._nyaitterImeComposition?.active &&
                    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
                ) {
                    commitNyaitterImeComposition(editor);
                    return;
                }
                if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    if (editor._nyaitterImeComposition?.active) {
                        commitNyaitterImeComposition(editor);
                        return;
                    }
                    insertMarkdownEditorText(editor, '\n');
                }
            });
            editor.addEventListener('paste', (event) => {
                if (event.defaultPrevented) return;
                commitNyaitterImeComposition(editor);
                const hasFiles = Array.from(event.clipboardData?.items || []).some((item) => item.kind === 'file');
                if (hasFiles) {
                    event.preventDefault();
                    return;
                }
                const text = event.clipboardData?.getData('text/plain');
                if (typeof text === 'string') {
                    event.preventDefault();
                    insertMarkdownEditorText(editor, text);
                }
            });
            editor.addEventListener('compositionstart', () => {
                commitNyaitterImeComposition(editor);
                editor._markdownEditorCompositionActive = true;
                editor.classList.add('is-system-ime-composing');
                editor.classList.remove('is-logically-empty');
            });
            editor.addEventListener('compositionend', () => {
                editor._markdownEditorCompositionActive = false;
                editor.classList.remove('is-system-ime-composing');
                renderDirectContentEditor(editor);
                autoResizeMarkdownEditor(editor);
            });
            editor.addEventListener('input', () => {
                enforceDirectEditorMaxLength(editor);
                if (!editor._markdownEditorCompositionActive) {
                    const pending = editor._directEditorBeforeInput;
                    let selection = null;
                    if (pending?.inputType?.startsWith('delete')) {
                        const previous = pending.selection;
                        const caret =
                            Number.isInteger(pending.deleteCaret)
                                ? pending.deleteCaret
                                : previous.start;
                        selection = { start: caret, end: caret, direction: 'none' };
                    }
                    delete editor._directEditorBeforeInput;
                    renderDirectContentEditor(editor, selection);
                }
                autoResizeMarkdownEditor(editor);
            });
            editor.addEventListener('focus', () => autoResizeMarkdownEditor(editor));
            editor.addEventListener('blur', () => commitNyaitterImeComposition(editor));
        }
        renderDirectContentEditor(editor, { start: getMarkdownEditorValue(editor).length, end: getMarkdownEditorValue(editor).length });
        autoResizeMarkdownEditor(editor);
        void customEmojiPromise.then(() => renderDirectContentEditor(editor));
        return editor;
    }
    if (!(editor instanceof HTMLTextAreaElement)) return editor;
    if (!useNyaitterEditor) {
        editor.addEventListener('input', () => autoResizeMarkdownEditor(editor));
        editor.addEventListener('focus', () => autoResizeMarkdownEditor(editor));
        autoResizeMarkdownEditor(editor);
        scheduleNextFrame(() => autoResizeMarkdownEditor(editor));
        return editor;
    }
    if (editor.dataset.markdownContentEditor === 'true') {
        updateMarkdownEditorPreview(editor);
        scheduleNextFrame(() => autoResizeMarkdownEditor(editor));
        return editor;
    }
    editor.dataset.markdownContentEditor = 'true';
    editor.spellcheck = true;
    ensureGlobalSelectionChangeListener();

    const sync = () => {
        syncMarkdownEditorDecoration(editor);
        autoResizeMarkdownEditor(editor);
    };
    const updateComposition = (event) => {
        const previous = editor._markdownEditorComposition;
        editor._markdownEditorComposition = {
            active: true,
            start: previous?.start ?? editor.selectionStart,
            data: String(event.data || ''),
        };
        updateMarkdownEditorPreview(editor);
    };

    editor.addEventListener('compositionstart', updateComposition);
    editor.addEventListener('compositionupdate', updateComposition);
    editor.addEventListener('compositionend', () => {
        delete editor._markdownEditorComposition;
        updateMarkdownEditorPreview(editor);
    });
    editor.addEventListener('input', () => updateMarkdownEditorPreview(editor));
    editor.addEventListener('select', sync);
    editor.addEventListener('keyup', sync);
    editor.addEventListener('focus', sync);
    editor.addEventListener('blur', sync);
    editor.addEventListener('scroll', sync);
    getMarkdownEditorPreview(editor)?.addEventListener('load', sync, true);

    if (typeof ResizeObserver !== 'undefined') {
        const host = editor.closest('.markdown-textarea-editor');
        if (host && !host._markdownResizeObserver) {
            const observer = new ResizeObserver(() => {
                if (editor.offsetParent !== null) {
                    autoResizeMarkdownEditor(editor);
                }
            });
            observer.observe(host);
            host._markdownResizeObserver = observer;
        }
    }

    void customEmojiPromise.then(() => updateMarkdownEditorPreview(editor));
    updateMarkdownEditorPreview(editor);
    scheduleNextFrame(() => {
        autoResizeMarkdownEditor(editor);
        syncMarkdownEditorDecoration(editor);
    });
    return editor;
}

export function setMarkdownEditorValue(editor, value, { focus = false } = {}) {
    if (!(editor instanceof HTMLElement)) return;
    const normalized = normalizeMarkdownEditorValue(value);
    if (editor instanceof HTMLTextAreaElement) {
        editor.value = normalized;
    } else {
        editor.textContent = normalized;
    }
    if (focus) editor.focus();
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

export function insertMarkdownEditorText(editor, value) {
    if (!(editor instanceof HTMLElement) || !value) return;
    editor.focus();
    const text = String(value);
    if (isContentEditableEditor(editor)) {
        const { start, end } = getContentEditableSelection(editor);
        replaceMarkdownEditorRange(editor, text, start, end, 'end');
        return;
    }
    if (!(editor instanceof HTMLTextAreaElement)) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.setRangeText(text, start, end, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

export function toggleMarkdownSpoiler(editor) {
    if (!(editor instanceof HTMLElement)) return;
    editor.focus();
    const value = getMarkdownEditorValue(editor);
    const snapshot = getMarkdownEditorSelectionSnapshot(editor);
    const start = snapshot.start;
    const end = snapshot.end;
    const hasSelection = start !== end;
    const selection = value.slice(start, end);

    if (isContentEditableEditor(editor)) {
        if (hasSelection) {
            if (selection.startsWith('||') && selection.endsWith('||') && selection.length >= 4) {
                replaceMarkdownEditorRange(editor, selection.slice(2, -2), start, end, 'select');
            } else {
                replaceMarkdownEditorRange(editor, `||${selection}||`, start, end, 'select');
            }
        } else {
            const before = value.slice(0, start);
            const after = value.slice(start);
            if (before.endsWith('||') && after.startsWith('||')) {
                replaceMarkdownEditorRange(editor, '', start - 2, start + 2, 'end');
            } else {
                replaceMarkdownEditorRange(editor, '||||', start, start, 'end');
                setContentEditableSelection(editor, start + 2);
            }
        }
        return;
    }
    if (!(editor instanceof HTMLTextAreaElement)) return;

    if (hasSelection) {
        if (selection.startsWith('||') && selection.endsWith('||') && selection.length >= 4) {
            const inner = selection.slice(2, -2);
            editor.setRangeText(inner, start, end, 'select');
        } else {
            editor.setRangeText(`||${selection}||`, start, end, 'select');
        }
    } else {
        const before = value.slice(0, start);
        const after = value.slice(start);
        if (before.endsWith('||') && after.startsWith('||')) {
            editor.setRangeText('', start - 2, start + 2, 'end');
        } else {
            editor.setRangeText('||||', start, start, 'end');
            editor.setSelectionRange(start + 2, start + 2);
        }
    }
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

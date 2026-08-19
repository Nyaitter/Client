import { getCurrentUser } from '../state.js';
import { formatPostContent, customEmojiPromise } from './format.js';
import { applyServerInputLimits, scheduleNextFrame } from '../utils/helpers.js';

export function normalizeMarkdownEditorValue(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n');
}

export function getMarkdownEditorValue(editor) {
    return normalizeMarkdownEditorValue(editor?.value);
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
        if (node.classList.contains('markdown-syntax')) return node.textContent.length;
        if (node.classList.contains('markdown-editor-emoji')) return node.textContent.length + 2;
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
            if (node.classList.contains('markdown-editor-emoji')) {
                const idNode = node.querySelector('.markdown-editor-emoji-id');
                const idText = idNode?.textContent || '';
                const image = node.querySelector('img.nyaitter-emoji');
                if (image) {
                    segments.push({
                        node: image,
                        start: currentPosition + 1,
                        end: currentPosition + 1 + idText.length,
                        length: idText.length,
                    });
                }
                currentPosition += idText.length + 2;
                return;
            }

            if (node.tagName === 'BR') {
                segments.push({
                    node,
                    start: currentPosition,
                    end: currentPosition + 1,
                    length: 1,
                });
                currentPosition += 1;
                return;
            }

            node.childNodes.forEach(traverse);
        }
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
    const { start: selectionStart, end: selectionEnd } = selection;
    const { segments } = getMarkdownEditorSourceSegments(preview);
    preview.querySelectorAll('.markdown-editor-emoji').forEach((token) => {
        const image = token.querySelector('img.nyaitter-emoji[data-emoji-id]');
        const label = token.querySelector('.markdown-editor-emoji-id');
        const segment = segments.find((item) => item.node === image);
        if (!image || !label || !segment) return;
        const tokenStart = Math.max(0, segment.start - 1);
        const tokenEnd = segment.end + 1;
        const active =
            selectionStart === selectionEnd
                ? selectionStart > tokenStart && selectionStart < tokenEnd
                : selectionStart < tokenEnd && selectionEnd > tokenStart;
        image.hidden = active;
        label.hidden = !active;
    });
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
}

export function syncMarkdownEditorPreviewHeight(editor, preview) {
    if (!editor || !preview) return;
    const computed = window.getComputedStyle(editor);
    const minHeight = parseFloat(computed.minHeight) || 0;
    const targetHeight = Math.max(editor.scrollHeight, minHeight);
    preview.style.minHeight = `${targetHeight}px`;
}

export function setMarkdownEditorPreview(preview, html, mode) {
    if (!preview) return;
    preview.dataset.markdownEditorMode = mode;
    preview.innerHTML = html;
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
            ? formatPostContent(rawValue, new Map(), {
                  allowMarkdown: true,
                  editorSyntax: !published,
                  allowContentDecorations: published,
              })
            : '';
    }
    preview.dataset.markdownEditorMode = mode;
    syncMarkdownEditorPreviewHeight(editor, preview);

    if (published) {
        scheduleNextFrame(() => syncMarkdownEditorPreviewHeight(editor, preview));
    } else {
        scheduleNextFrame(() => syncMarkdownEditorDecoration(editor));
    }
}

export function getContentEditorPreference() {
    return getCurrentUser()?.settings?.content_editor !== 'native';
}

export function applyContentEditorPreference(editor) {
    if (!(editor instanceof HTMLTextAreaElement)) return false;
    const container = editor.closest('.markdown-editor-container');
    const enabled = getContentEditorPreference();
    if (!container) return enabled;
    container.classList.toggle('is-native', !enabled);
    container.classList.toggle('is-nyaitter-editor', enabled);
    return enabled;
}

export function refreshMarkdownContentEditors(root = document) {
    const selector = 'textarea.post-form-textarea, textarea.edit-post-textarea';
    const editors = [];
    if (root instanceof HTMLTextAreaElement && root.matches(selector)) {
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
    if (!(editor instanceof HTMLTextAreaElement)) return;
    applyServerInputLimits(editor);
    const useNyaitterEditor = applyContentEditorPreference(editor);
    if (!useNyaitterEditor) return;
    if (editor.dataset.markdownContentEditor === 'true') {
        updateMarkdownEditorPreview(editor);
        return;
    }
    editor.dataset.markdownContentEditor = 'true';
    editor.spellcheck = true;
    ensureGlobalSelectionChangeListener();

    const sync = () => syncMarkdownEditorDecoration(editor);
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

    void customEmojiPromise.then(() => updateMarkdownEditorPreview(editor));
    updateMarkdownEditorPreview(editor);
}

export function setMarkdownEditorValue(editor, value, { focus = false } = {}) {
    if (!(editor instanceof HTMLTextAreaElement)) return;
    editor.value = normalizeMarkdownEditorValue(value);
    if (focus) editor.focus();
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

export function insertMarkdownEditorText(editor, value) {
    if (!(editor instanceof HTMLTextAreaElement) || !value) return;
    editor.focus();
    const text = String(value);
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.setRangeText(text, start, end, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

export function toggleMarkdownSpoiler(editor) {
    if (!(editor instanceof HTMLTextAreaElement)) return;
    editor.focus();
    const value = getMarkdownEditorValue(editor);
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const hasSelection = start !== end;
    const selection = value.slice(start, end);

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

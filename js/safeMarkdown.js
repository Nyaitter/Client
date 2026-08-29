function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function decodeHtmlEntities(value) {
    const source = String(value ?? '');
    if (!source.includes('&')) return source;
    const decoder = document.createElement('textarea');
    decoder.innerHTML = source;
    return decoder.value;
}

/**
 * Markdownリンク用のURLはHTTPSだけを許可する。
 * プロトコル相対URL・data:・javascript:・file:・認証情報付きURLも拒否する。
 */
export function getSafeMarkdownUrl(value) {
    const raw = decodeHtmlEntities(value);
    // 制御文字とそのパーセントエンコードは、ブラウザ・中継層ごとの解釈差を避けるため拒否する。
    if (
        /[\u0000-\u001F\u007F]/.test(raw) ||
        /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw)
    )
        return '';
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || url.username || url.password) return '';
        return url.href;
    } catch (_) {
        return '';
    }
}

function renderInlineMarkdown(
    source,
    { renderText, renderLinkLabel, sanitizeUrl, renderSyntax = () => '' },
) {
    // `_emoji_` は既存のカスタム絵文字記法なので、下線による斜体は採用しない。
    const markdownPattern = /`([^`\r\n]{1,500})`|\[([^\]\r\n]{1,200})\]\((https?:\/\/[^\s<>"']{1,2048})\)|\*\*\*([^*\r\n]{1,500})\*\*\*|\*\*([^*\r\n]{1,500})\*\*|__([^_\r\n]{1,500})__|~~([^~\r\n]{1,500})~~|(?:(?<!\*)|(?<=\*\*))\*([^*\r\n]{1,500})\*(?=$|[^*]|\*\*)|==([^=\r\n]{1,500})==|\+\+([^+・\r\n]{1,500})\+\+|\|\|([^|\r\n]{1,1000})\|\||\^([^\^\r\n]{1,200})\^|(?<!~)~([^~\r\n]{1,200})~(?!~)|\[\[([^\]\r\n]{1,100})\]\]|\[(?:ruby|rb)=([^\]\r\n]{1,100})\]([^\[\r\n]{1,200})\[\/(?:ruby|rb)?\]/g;
    let output = '';
    let previousIndex = 0;
    let match;

    while ((match = markdownPattern.exec(source)) !== null) {
        output += renderText(source.slice(previousIndex, match.index));
        if (match[1] !== undefined) {
            output += `${renderSyntax('`')}<code>${escapeHtml(match[1])}</code>${renderSyntax('`')}`;
        } else if (match[2] !== undefined) {
            const safeUrl = sanitizeUrl(match[3]);
            output += safeUrl
                ? `${renderSyntax('[')}<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${renderLinkLabel(match[2])}</a>${renderSyntax('](')}${renderSyntax(match[3])}${renderSyntax(')')}`
                : renderText(match[0]);
        } else if (match[4] !== undefined) {
            output += `${renderSyntax('***')}<strong><em>${renderText(match[4])}</em></strong>${renderSyntax('***')}`;
        } else if (match[5] !== undefined || match[6] !== undefined) {
            const marker = match[5] !== undefined ? '**' : '__';
            output += `${renderSyntax(marker)}<strong>${renderText(match[5] ?? match[6])}</strong>${renderSyntax(marker)}`;
        } else if (match[7] !== undefined) {
            output += `${renderSyntax('~~')}<del>${renderText(match[7])}</del>${renderSyntax('~~')}`;
        } else if (match[8] !== undefined) {
            output += `${renderSyntax('*')}<em>${renderText(match[8])}</em>${renderSyntax('*')}`;
        } else if (match[9] !== undefined) {
            output += `${renderSyntax('==')}<mark class="markdown-mark">${renderText(match[9])}</mark>${renderSyntax('==')}`;
        } else if (match[10] !== undefined) {
            output += `${renderSyntax('++')}<ins>${renderText(match[10])}</ins>${renderSyntax('++')}`;
        } else if (match[11] !== undefined) {
            output += `${renderSyntax('||')}<span class="markdown-spoiler" role="button" tabindex="0" aria-expanded="false" aria-label="ネタバレを表示"><span class="markdown-spoiler-content" aria-hidden="true">${renderText(match[11])}</span></span>${renderSyntax('||')}`;
        } else if (match[12] !== undefined) {
            output += `${renderSyntax('^')}<sup>${renderText(match[12])}</sup>${renderSyntax('^')}`;
        } else if (match[13] !== undefined) {
            output += `${renderSyntax('~')}<sub>${renderText(match[13])}</sub>${renderSyntax('~')}`;
        } else if (match[14] !== undefined) {
            output += `${renderSyntax('[[')}<kbd class="markdown-kbd">${escapeHtml(match[14])}</kbd>${renderSyntax(']]')}`;
        } else if (match[15] !== undefined && match[16] !== undefined) {
            const rubyText = escapeHtml(match[15]);
            const baseText = renderText(match[16]);
            output += `${renderSyntax(`[ruby=${match[15]}]`)}<ruby class="markdown-ruby">${baseText}<rp>(</rp><rt class="markdown-rt">${rubyText}</rt><rp>)</rp></ruby>${renderSyntax('[/ruby]')}`;
        }
        previousIndex = markdownPattern.lastIndex;
    }

    return output + renderText(source.slice(previousIndex));
}

function parseTableAlignments(delimiterLine) {
    const cells = delimiterLine.trim().replace(/^\||\|$/g, '').split('|');
    return cells.map((cell) => {
        const trimmed = cell.trim();
        const left = trimmed.startsWith(':');
        const right = trimmed.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return '';
    });
}

function isTableDelimiter(line) {
    if (!line.includes('|')) return false;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|');
    if (cells.length === 0) return false;
    return cells.every((c) => /^:?-{2,}:?$/.test(c.trim()));
}

function splitTableCells(line) {
    return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

/**
 * 生HTMLを一切許可しない、投稿・DM用の限定Markdown。
 * 許可記法:
 * - インライン: ***太字斜体*** / **太字** / __太字__ / *斜体* / ~~取り消し線~~ / ==ハイライト== / ++下線++ / `コード` / ||ネタバレ|| / ^上付き^ / ~下付き~ / [[キー]]
 * - リンク: [ラベル](https://example.com)
 * - ブロック: # 〜 ###### 見出し、> 引用、- 箇条書き（- [x] タスク）、1. 番号付きリスト、--- 水平線、| 表 | テーブル、```コードブロック```
 *
 * HTML、外部埋め込み、任意スクリプト属性はすべて無害化する。
 */
export function renderLimitedMarkdown(
    input,
    {
        renderText = escapeHtml,
        renderLinkLabel = escapeHtml,
        sanitizeUrl = getSafeMarkdownUrl,
        renderSyntax = () => '',
        allowHeadings = true,
        allowBlockquotes = true,
    } = {},
) {
    const source = typeof input === 'string' ? input : '';
    const inlineOptions = {
        renderText,
        renderLinkLabel,
        sanitizeUrl,
        renderSyntax,
    };
    const renderInline = (value) => renderInlineMarkdown(value, inlineOptions);
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    const paragraphLines = [];

    const flushParagraph = () => {
        if (paragraphLines.length === 0) return;
        output.push(`<p>${renderInline(paragraphLines.join('\n'))}</p>`);
        paragraphLines.length = 0;
    };

    for (let index = 0; index < lines.length;) {
        const line = lines[index];

        // 1. コードブロック
        if (/^```[^`\r\n]*$/.test(line)) {
            let endIndex = index + 1;
            while (endIndex < lines.length && !/^```\s*$/.test(lines[endIndex])) {
                endIndex += 1;
            }
            if (endIndex < lines.length) {
                flushParagraph();
                const code = escapeHtml(
                    lines.slice(index + 1, endIndex).join('\n'),
                );
                const openingFence = renderSyntax('```');
                const closingFence = renderSyntax('```');
                output.push(
                    `<pre><code>${openingFence ? `${openingFence}\n` : ''}${code}${closingFence ? `\n${closingFence}` : ''}</code></pre>`,
                );
                index = endIndex + 1;
                continue;
            }
        }

        // 2. 水平線 (---, ***, ___)
        if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
            flushParagraph();
            output.push('<hr class="markdown-hr">');
            index += 1;
            continue;
        }

        // 3. テーブル
        if (line.includes('|') && index + 1 < lines.length && isTableDelimiter(lines[index + 1])) {
            flushParagraph();
            const headerCells = splitTableCells(line);
            const alignments = parseTableAlignments(lines[index + 1]);
            index += 2;

            const bodyRows = [];
            while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
                bodyRows.push(splitTableCells(lines[index]));
                index += 1;
            }

            const thead = `<thead><tr>${headerCells.map((cell, i) => {
                const align = alignments[i] ? ` style="text-align:${alignments[i]}"` : '';
                return `<th${align}>${renderInline(cell)}</th>`;
            }).join('')}</tr></thead>`;

            const tbody = `<tbody>${bodyRows.map((row) => `<tr>${headerCells.map((_, i) => {
                const cell = row[i] || '';
                const align = alignments[i] ? ` style="text-align:${alignments[i]}"` : '';
                return `<td${align}>${renderInline(cell)}</td>`;
            }).join('')}</tr>`).join('')}</tbody>`;

            output.push(`<div class="markdown-table-wrapper"><table class="markdown-table">${thead}${tbody}</table></div>`);
            continue;
        }

        // 4. 見出し (# 〜 ######)
        const headingMatch = /^(#{1,6})\s+([^\s].*)$/.exec(line);
        if (!allowHeadings && headingMatch) {
            flushParagraph();
            output.push(
                `<p>${renderSyntax(headingMatch[1])} ${renderInline(headingMatch[2])}</p>`,
            );
            index += 1;
            continue;
        }
        if (allowHeadings && headingMatch) {
            flushParagraph();
            const level = headingMatch[1].length;
            output.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
            index += 1;
            continue;
        }

        // 5. 引用
        const quoteMatch = /^> (.*)$/.exec(line);
        if (!allowBlockquotes && quoteMatch) {
            flushParagraph();
            output.push(
                `<p>${renderSyntax('>')} ${renderInline(quoteMatch[1])}</p>`,
            );
            index += 1;
            continue;
        }
        if (allowBlockquotes && quoteMatch) {
            flushParagraph();
            const quoteLines = [];
            while (index < lines.length && /^> /.test(lines[index])) {
                quoteLines.push(lines[index].replace(/^> /, ''));
                index += 1;
            }
            output.push(`<blockquote>${renderInline(quoteLines.join('\n'))}</blockquote>`);
            continue;
        }

        // 6. 箇条書きリスト (タスクリスト - [ ] / - [x] 対応)
        const unorderedMatch = /^[-*+]\s+(.+)$/.exec(line);
        if (unorderedMatch) {
            flushParagraph();
            const items = [];
            while (index < lines.length) {
                const itemMatch = /^[-*+]\s+(.+)$/.exec(lines[index]);
                if (!itemMatch) break;
                const marker = lines[index].match(/^[-*+]\s+/)?.[0] || '';
                const itemText = itemMatch[1];
                const taskMatch = /^\[([ xX])\]\s*(.*)$/.exec(itemText);
                if (taskMatch) {
                    const isChecked = taskMatch[1].toLowerCase() === 'x';
                    items.push(
                        `<li class="markdown-task-item"><input type="checkbox" class="markdown-task-checkbox" ${isChecked ? 'checked' : ''} disabled aria-disabled="true"> ${renderInline(taskMatch[2])}</li>`,
                    );
                } else {
                    items.push(
                        `<li>${renderSyntax(marker)}${renderInline(itemText)}</li>`,
                    );
                }
                index += 1;
            }
            output.push(`<ul>${items.join('')}</ul>`);
            continue;
        }

        // 7. 番号付きリスト
        const orderedMatch = /^\d{1,3}[.)]\s+(.+)$/.exec(line);
        if (orderedMatch) {
            flushParagraph();
            const items = [];
            while (index < lines.length) {
                const itemMatch = /^\d{1,3}[.)]\s+(.+)$/.exec(lines[index]);
                if (!itemMatch) break;
                const marker =
                    lines[index].match(/^\d{1,3}[.)]\s+/)?.[0] || '';
                items.push(
                    `<li>${renderSyntax(marker)}${renderInline(itemMatch[1])}</li>`,
                );
                index += 1;
            }
            output.push(`<ol>${items.join('')}</ol>`);
            continue;
        }

        // 8. 空行
        if (line.trim() === '') {
            flushParagraph();
            output.push('<p class="markdown-empty-line"><br></p>');
            index += 1;
            continue;
        }

        paragraphLines.push(line);
        index += 1;
    }

    flushParagraph();
    return output.join('');
}

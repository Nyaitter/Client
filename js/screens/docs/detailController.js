import { DOM } from '../../dom.js';
import { renderNyarkDown } from '../../modules/nyarkdown.js';
import { getAllUsersCache } from '../../state.js';
import { getActiveScreenContext } from '../../screenManager.js';
import { showLoading } from '../../utils/helpers.js';
import { renderDocument, renderError, renderHeader, renderLoading } from './detailView.js';

export async function mountDocDetailScreen(docId, showScreenFn) {
    renderHeader();
    if (typeof showScreenFn === 'function') showScreenFn('doc-detail-screen');
    const content = document.getElementById('doc-detail-content');
    if (!content) return;
    const signal = getActiveScreenContext()?.signal;
    renderLoading(content);
    showLoading(true);

    try {
        const response = await globalThis.NyaitterClientInstance.system.getDocResponse(docId, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (signal?.aborted) return;
        const doc = data.document;
        if (!doc) throw new Error('Document not found');
        const renderedBody = renderNyarkDown(doc.content || '', getAllUsersCache(), {
            allowMarkdown: true,
            allowContentDecorations: true,
            allowHeadings: true,
            allowBlockquotes: true,
        });
        renderDocument(content, doc.title, renderedBody, doc.updated_at);
    } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) return;
        console.error('[docs] Failed to load document:', error);
        renderError(content);
    } finally {
        if (!signal?.aborted) showLoading(false);
    }
}

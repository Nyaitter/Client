/** コミュニティノート API */
export class NotesAPI {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.js").NyaitterClient);
    _client: import("../NyaitterClient.js").NyaitterClient;
    /**
     * @param {number|string} postId
     * @param {object} params
     * @param {string} params.content - 1〜1000文字
     * @param {(string|{url: string, title?: string})[]} [params.sources] - HTTPS の出典
     * @param {string[]} [params.reasons] - create 側の理由コード（最大3件）
     * @returns {Promise<{note: import('../models.js').CommunityNote}>}
     */
    create(postId: number | string, { content, sources, reasons }?: {
        content: string;
        sources?: (string | {
            url: string;
            title?: string;
        })[];
        reasons?: string[];
    }): Promise<{
        note: import("../models.js").CommunityNote;
    }>;
    /**
     * @param {number|string} postId
     * @returns {Promise<{notes: import('../models.js').CommunityNote[], eligible: boolean}>}
     */
    list(postId: number | string): Promise<{
        notes: import("../models.js").CommunityNote[];
        eligible: boolean;
    }>;
    /**
     * 複数の投稿のノートを一括で取得します（タイムライン表示時の N+1 回避用）。
     * 閲覧できない・存在しない投稿は結果に含まれず、`missing_post_ids` に入ります。
     *
     * @param {(number|string)[]} postIds - 投稿 ID（最大50件、重複は除かれます）
     * @returns {Promise<{notes_by_post: Record<string, {notes: import('../models.js').CommunityNote[], eligible: boolean}>, missing_post_ids: number[]}>}
     */
    listForPosts(postIds: (number | string)[]): Promise<{
        notes_by_post: Record<string, {
            notes: import("../models.js").CommunityNote[];
            eligible: boolean;
        }>;
        missing_post_ids: number[];
    }>;
    /**
     * @param {object} [params]
     * @param {'create'|'positive'|'negative'} [params.side]
     * @returns {Promise<{tags: import('../models.js').NoteReasonTag[]}>}
     */
    getReasonTags({ side }?: {
        side?: "create" | "positive" | "negative";
    }): Promise<{
        tags: import("../models.js").NoteReasonTag[];
    }>;
    /**
     * @param {number|string} noteId
     * @param {object} params
     * @param {boolean} params.helpful
     * @param {string[]} [params.reasons] - positive / negative 側の理由コード（最大3件）
     * @returns {Promise<import('../models.js').NoteRatingSummary & {reasons: string[]}>}
     */
    rate(noteId: number | string, { helpful, reasons }?: {
        helpful: boolean;
        reasons?: string[];
    }): Promise<import("../models.js").NoteRatingSummary & {
        reasons: string[];
    }>;
    /**
     * @param {number|string} noteId
     * @returns {Promise<{success: boolean}>}
     */
    delete(noteId: number | string): Promise<{
        success: boolean;
    }>;
    /**
     * 管理者がノートを再判定します。
     * @param {number|string} noteId
     * @returns {Promise<{note: import('../models.js').CommunityNote}>}
     */
    reEvaluate(noteId: number | string): Promise<{
        note: import("../models.js").CommunityNote;
    }>;
}

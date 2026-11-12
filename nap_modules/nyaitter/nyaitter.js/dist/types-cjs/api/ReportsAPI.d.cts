/**
 * 報告API
 * 不適切な投稿やユーザーの通報、および管理者向けモデレーション審査を行います。
 */
export class ReportsAPI {
    /** @param {import('../NyaitterClient.cjs').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.cjs").NyaitterClient);
    _client: import("../NyaitterClient.cjs").NyaitterClient;
    /** 管理者専用。割当済み通報を取得します（`required` 認証だけでなくServer側admin権限が必要）。
     * @param {{status?: string, limit?: number, offset?: number}} [params]
     */
    listAssigned({ status, limit, offset }?: {
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<any>;
    /** 管理者専用。report assignment種別により `decision`/`actions` 等のbody要件が異なります。 */
    resolve(reportId: any, body?: {}): Promise<any>;
    retractTrust(reportId: any, body?: {}): Promise<any>;
    /**
     * 不適切な投稿またはユーザーを通報・報告します。
     *
     * @param {object} params
     * @param {'post'|'user'} params.targetKind - 報告対象の種類
     * @param {number|string} params.targetId - 報告対象の投稿 ID またはユーザー ID
     * @param {string} params.description - 通報理由・詳細説明
     * @param {number} [params.postAsUserId] - 代理通報ユーザー ID
     * @returns {Promise<{ success: boolean, report: { id: number, status: string, assignment_type: string, reporter_id: number, target_kind: string, target_id: number, assigned_at: string|null, created_at: string } }>}
     *
     * @example
     * await client.reports.create({
     *   targetKind: 'post',
     *   targetId: 123,
     *   description: 'スパム投稿です。',
     * });
     */
    create({ targetKind, targetId, description, postAsUserId }?: {
        targetKind: "post" | "user";
        targetId: number | string;
        description: string;
        postAsUserId?: number;
    }): Promise<{
        success: boolean;
        report: {
            id: number;
            status: string;
            assignment_type: string;
            reporter_id: number;
            target_kind: string;
            target_id: number;
            assigned_at: string | null;
            created_at: string;
        };
    }>;
    /**
     * 通報一覧を取得します。
     *
     * @param {object} [params]
     * @param {string} [params.status] - 絞り込みステータス
     * @param {number} [params.limit=50] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ reports: object[] }>}
     */
    list({ status, limit, offset }?: {
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        reports: object[];
    }>;
    /**
     * 通報の詳細を取得します。
     *
     * @param {number} reportId - 通報 ID
     * @returns {Promise<{ report: object }>}
     */
    get(reportId: number): Promise<{
        report: object;
    }>;
    /**
     * 通報の審査ステータスを更新します。
     *
     * @param {number} reportId - 通報 ID
     * @param {object} params
     * @param {string} params.status - 新しいステータス
     * @param {string} [params.note] - モデレーターメモ
     * @param {string} [params.action] - 実行したアクション
     * @returns {Promise<{ success: boolean, report: object }>}
     */
    update(reportId: number, { status, note, action }?: {
        status: string;
        note?: string;
        action?: string;
    }): Promise<{
        success: boolean;
        report: object;
    }>;
}

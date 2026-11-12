/**
 * 認証バッジ申請 API
 * アカウントの認証マーク申請および本人の審査状況を確認します。
 * 審査管理（管理者側）は ReportsAPI を使います。
 */
export class VerificationAPI {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.js").NyaitterClient);
    _client: import("../NyaitterClient.js").NyaitterClient;
    /**
     * 自分の認証バッジ申請の現在の審査ステータスを取得します。
     *
     * @returns {Promise<{ application: { id: number, status: string, assigned_at: string|null, created_at: string|null }|null }>}
     *
     * @example
     * const { application } = await client.verification.getStatus();
     * if (application) {
     *   console.log('申請状況:', application.status);
     * }
     */
    getStatus(): Promise<{
        application: {
            id: number;
            status: string;
            assigned_at: string | null;
            created_at: string | null;
        } | null;
    }>;
    /**
     * 認証バッジを申請します。
     *
     * @returns {Promise<{ application: { id: number, status: string, assigned_at: string|null, created_at: string|null }|null }>}
     *
     * @example
     * await client.verification.apply();
     */
    apply(): Promise<{
        application: {
            id: number;
            status: string;
            assigned_at: string | null;
            created_at: string | null;
        } | null;
    }>;
}

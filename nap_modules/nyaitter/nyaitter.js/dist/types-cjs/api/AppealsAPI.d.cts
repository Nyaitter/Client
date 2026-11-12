/**
 * 異議申し立て API
 * 凍結アカウントからの異議申し立ての確認・提出を行います。
 */
export class AppealsAPI {
    /** @param {import('../NyaitterClient.cjs').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.cjs").NyaitterClient);
    _client: import("../NyaitterClient.cjs").NyaitterClient;
    /**
     * 自分のアカウント凍結に対する異議申し立ての状態を取得します。
     *
     * @returns {Promise<{ appeal: { id: number, status: string, assigned_at: string|null, created_at: string|null, freeze_reason: string|null }|null }>}
     *
     * @example
     * const { appeal } = await client.appeals.getStatus();
     * if (appeal) {
     *   console.log('審査状況:', appeal.status);
     * }
     */
    getStatus(): Promise<{
        appeal: {
            id: number;
            status: string;
            assigned_at: string | null;
            created_at: string | null;
            freeze_reason: string | null;
        } | null;
    }>;
    /**
     * 凍結に対する異議申し立てを提出します。
     *
     * @param {object} params
     * @param {string} params.description - 申し立て理由・詳細説明
     * @returns {Promise<{ appeal: object }>}
     *
     * @example
     * await client.appeals.create({
     *   description: '利用規約を再確認しました。凍結解除をお願いいたします。',
     * });
     */
    create({ description }?: {
        description: string;
    }): Promise<{
        appeal: object;
    }>;
}

/**
 * Web Push 通知 API
 * ブラウザプッシュ通知の公開鍵取得・購読登録・購読解除を行います。
 */
export class PushAPI {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.js").NyaitterClient);
    _client: import("../NyaitterClient.js").NyaitterClient;
    /**
     * Web Push 通知のサーバー設定を取得します。
     *
     * @returns {Promise<{ enabled: boolean, vapid_public_key: string|null, subscription_count: number }>}
     */
    getConfig(): Promise<{
        enabled: boolean;
        vapid_public_key: string | null;
        subscription_count: number;
    }>;
    /**
     * ブラウザの PushSubscription をサーバーに登録します。
     *
     * @param {object} params
     * @param {PushSubscription|object} params.subscription - ブラウザの PushSubscription オブジェクト
     * @returns {Promise<{ success: boolean }>}
     */
    subscribe({ subscription }?: {
        subscription: PushSubscription | object;
    }): Promise<{
        success: boolean;
    }>;
    /**
     * PushSubscription の登録を解除します。
     *
     * @param {string} endpoint - 登録解除する購読エンドポイント URL
     * @returns {Promise<{ success: boolean }>}
     */
    unsubscribe(endpoint: string): Promise<{
        success: boolean;
    }>;
}

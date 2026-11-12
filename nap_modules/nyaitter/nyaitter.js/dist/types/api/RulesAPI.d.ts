/**
 * コミュニティルール API
 * Nyaitter サーバーの利用規約・ガイドラインを取得します。
 */
export class RulesAPI {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.js").NyaitterClient);
    _client: import("../NyaitterClient.js").NyaitterClient;
    /**
     * サーバーのコミュニティルール・利用規約を取得します。
     *
     * @returns {Promise<{ success: boolean, rules: string, updated_at: string }>}
     *
     * @example
     * const { rules } = await client.rules.get();
     * console.log(rules);
     */
    get(): Promise<{
        success: boolean;
        rules: string;
        updated_at: string;
    }>;
}

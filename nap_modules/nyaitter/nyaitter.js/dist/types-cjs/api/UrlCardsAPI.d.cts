/**
 * URL カード API
 * 外部リンクや Nyaitter 投稿等の OGP カード情報を取得します。
 */
export class UrlCardsAPI {
    /** @param {import('../NyaitterClient.cjs').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.cjs").NyaitterClient);
    _client: import("../NyaitterClient.cjs").NyaitterClient;
    /**
     * 指定した URL の OGP カード情報を取得します。
     *
     * @param {string} url - 展開対象の URL
     * @returns {Promise<{ card: object|null }>}
     *
     * @example
     * const { card } = await client.urlCards.get('https://scratch.mit.edu');
     * console.log('タイトル:', card?.title);
     */
    get(url: string): Promise<{
        card: object | null;
    }>;
}

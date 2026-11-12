/**
 * oEmbed API
 * Nyaitter 投稿等の oEmbed 埋め込み用メタデータを取得します。
 */
export class OEmbedAPI {
    /** @param {import('../NyaitterClient.cjs').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.cjs").NyaitterClient);
    _client: import("../NyaitterClient.cjs").NyaitterClient;
    /**
     * Nyaitter 投稿 URL から oEmbed 埋め込みデータを取得します。
     *
     * @param {string} url - 投稿の URL
     * @param {object} [params]
     * @param {number} [params.maxWidth] - 最大幅
     * @param {number} [params.maxHeight] - 最大高さ
     * @returns {Promise<{ type: string, version: string, title?: string, author_name?: string, author_url?: string, provider_name: string, provider_url: string, html: string, width?: number, height?: number }>}
     *
     * @example
     * const data = await client.oembed.get('https://nyaitter.example.com/posts/123');
     * console.log(data.html);
     */
    get(url: string, { maxWidth, maxHeight }?: {
        maxWidth?: number;
        maxHeight?: number;
    }): Promise<{
        type: string;
        version: string;
        title?: string;
        author_name?: string;
        author_url?: string;
        provider_name: string;
        provider_url: string;
        html: string;
        width?: number;
        height?: number;
    }>;
}

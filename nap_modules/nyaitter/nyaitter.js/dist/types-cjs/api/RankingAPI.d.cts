/**
 * ランキング API
 * フォロワー数・投稿数・いいね数・スター数のユーザーランキングを取得します。
 */
export class RankingAPI {
    /** @param {import('../NyaitterClient.cjs').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.cjs").NyaitterClient);
    _client: import("../NyaitterClient.cjs").NyaitterClient;
    /**
     * 自分のランキング順位を取得します。
     *
     * @returns {Promise<{ followers: { rank: number|null, follower_count: number }, posts: { rank: number|null, post_count: number }, likes: { rank: number|null, like_count: number }, stars: { rank: number|null, star_count: number } }>}
     *
     * @example
     * const myRanks = await client.ranking.getMe();
     * console.log('フォロワー順位:', myRanks.followers.rank);
     */
    getMe(): Promise<{
        followers: {
            rank: number | null;
            follower_count: number;
        };
        posts: {
            rank: number | null;
            post_count: number;
        };
        likes: {
            rank: number | null;
            like_count: number;
        };
        stars: {
            rank: number | null;
            star_count: number;
        };
    }>;
    /**
     * 指定した項目のランキング上位ユーザー一覧を取得します。
     *
     * @param {'followers'|'posts'|'likes'|'stars'} type - ランキング項目
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @returns {Promise<{ data: Array<{ rank: number, id: number, name: string, scid?: string, count: number }> }>}
     *
     * @example
     * const { data } = await client.ranking.get('followers', { limit: 10 });
     * data.forEach((entry) => console.log(`${entry.rank}位: ${entry.name}`));
     */
    get(type: "followers" | "posts" | "likes" | "stars", { limit }?: {
        limit?: number;
    }): Promise<{
        data: Array<{
            rank: number;
            id: number;
            name: string;
            scid?: string;
            count: number;
        }>;
    }>;
    /**
     * フォロワー数ランキング上位を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @returns {Promise<{ data: object[] }>}
     */
    getFollowers({ limit }?: {
        limit?: number;
    }): Promise<{
        data: object[];
    }>;
    /**
     * 投稿数ランキング上位を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @returns {Promise<{ data: object[] }>}
     */
    getPosts({ limit }?: {
        limit?: number;
    }): Promise<{
        data: object[];
    }>;
    /**
     * いいね数ランキング上位を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @returns {Promise<{ data: object[] }>}
     */
    getLikes({ limit }?: {
        limit?: number;
    }): Promise<{
        data: object[];
    }>;
    /**
     * スター数ランキング上位を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @returns {Promise<{ data: object[] }>}
     */
    getStars({ limit }?: {
        limit?: number;
    }): Promise<{
        data: object[];
    }>;
}

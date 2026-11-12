/**
 * 投稿 API
 * 投稿の作成・取得・編集・削除・いいね・スター・リポスト・検索・トレンドなどを行います。
 */
export class PostsAPI {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.js").NyaitterClient);
    _client: import("../NyaitterClient.js").NyaitterClient;
    /**
     * 最新投稿一覧を取得します。
     * @param {{tab?: string, limit?: number, offset?: number, beforeId?: number, sinceId?: number, cursor?: string, order?: string}} [params]
     */
    list({ tab, limit, offset, beforeId, sinceId, cursor, order }?: {
        tab?: string;
        limit?: number;
        offset?: number;
        beforeId?: number;
        sinceId?: number;
        cursor?: string;
        order?: string;
    }): Promise<any>;
    /** 投稿のアクティビティを取得します。 */
    getActivity(postId: any): Promise<any>;
    /** 投稿にいいねしたユーザーを取得します。 */
    getLikes(postId: any, { limit }?: {
        limit?: number;
    }): Promise<any>;
    /** 投稿を低評価します。 */
    dislike(postId: any): Promise<any>;
    /** 管理者として投稿を削除します。 */
    adminDelete(postId: any): Promise<any>;
    /**
     * タイムラインの投稿一覧を取得します。
     *
     * @param {object} [params]
     * @param {'foryou'|'following'} [params.tab='foryou'] - タブ
     * @param {number} [params.limit=20] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {number} [params.beforeId] - このID以前の投稿を取得
     * @param {string} [params.cursor] - キーセットカーソル
     * @returns {Promise<{ posts: object[], has_more?: boolean, next_cursor?: any }>}
     *
     * @example
     * const { posts } = await client.posts.getTimeline({ tab: 'following' });
     */
    getTimeline({ tab, limit, offset, beforeId, cursor }?: {
        tab?: "foryou" | "following";
        limit?: number;
        offset?: number;
        beforeId?: number;
        cursor?: string;
    }): Promise<{
        posts: object[];
        has_more?: boolean;
        next_cursor?: any;
    }>;
    /**
     * おすすめ投稿一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=20] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {number} [params.beforeId] - このID以前の投稿を取得
     * @param {string} [params.cursor] - キーセットカーソル
     * @returns {Promise<{ posts: object[], has_next?: boolean, next_cursor?: any }>}
     */
    getRecommended({ limit, offset, beforeId, cursor }?: {
        limit?: number;
        offset?: number;
        beforeId?: number;
        cursor?: string;
    }): Promise<{
        posts: object[];
        has_next?: boolean;
        next_cursor?: any;
    }>;
    /**
     * トレンド投稿一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=20] - 取得件数
     * @returns {Promise<{ posts: object[] }>}
     */
    getTrending({ limit }?: {
        limit?: number;
    }): Promise<{
        posts: object[];
    }>;
    /**
     * トレンドハッシュタグ一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=10] - 取得件数
     * @returns {Promise<{ trends: Array<{ tag: string, count: number }> }>}
     */
    getTrendingHashtags({ limit }?: {
        limit?: number;
    }): Promise<{
        trends: Array<{
            tag: string;
            count: number;
        }>;
    }>;
    /**
     * 投稿を検索します。
     *
     * @param {object} params
     * @param {string} params.query - キーワード、from:#1234、at:YYYY-MM-DD、since:/until:、has:media/links、is:reply/quote/repost を併用可能（日付は UTC）
     * @param {number} [params.limit=20] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {number} [params.beforeId] - このID以前の投稿を取得
     * @param {string} [params.cursor] - キーセットカーソル
     * @returns {Promise<{ posts: object[], has_next?: boolean, next_cursor?: any }>}
     *
     * @example
     * const { posts } = await client.posts.search({ query: 'ねこ' });
     */
    search({ query, limit, offset, beforeId, cursor }?: {
        query: string;
        limit?: number;
        offset?: number;
        beforeId?: number;
        cursor?: string;
    }): Promise<{
        posts: object[];
        has_next?: boolean;
        next_cursor?: any;
    }>;
    /**
     * タイムライン・おすすめ・検索・プロフィール等の投稿ページを汎用取得します。
     *
     * @param {object} [params]
     * @param {'timeline'|'recommended'|'search'|'profile'|'ids'} [params.mode='timeline'] - ページモード
     * @param {'foryou'|'following'} [params.tab='foryou'] - タイムライン時のタブ
     * @param {string} [params.query] - 検索クエリ
     * @param {number} [params.userId] - ユーザーID
     * @param {'all'|'posts_only'|'replies_only'} [params.subType='all'] - プロフィール絞り込み
     * @param {number} [params.pinId] - 固定投稿ID
     * @param {number[]|string} [params.ids] - 投稿IDリスト
     * @param {number} [params.limit=30] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {number} [params.beforeId] - カーソル
     * @param {string} [params.cursor] - キーセットカーソル
     * @returns {Promise<{ posts: object[], has_more: boolean, next_cursor: any, context?: any, meta?: any }>}
     */
    getPage({ mode, tab, query, userId, subType, pinId, ids, limit, offset, beforeId, cursor, }?: {
        mode?: "timeline" | "recommended" | "search" | "profile" | "ids";
        tab?: "foryou" | "following";
        query?: string;
        userId?: number;
        subType?: "all" | "posts_only" | "replies_only";
        pinId?: number;
        ids?: number[] | string;
        limit?: number;
        offset?: number;
        beforeId?: number;
        cursor?: string;
    }): Promise<{
        posts: object[];
        has_more: boolean;
        next_cursor: any;
        context?: any;
        meta?: any;
    }>;
    /**
     * タイムラインの投稿 ID 一覧のみを軽量に取得します。
     *
     * @param {object} [params]
     * @param {'foryou'|'following'} [params.tab='foryou'] - タブ
     * @param {number} [params.limit=30] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {string} [params.cursor] - キーセットカーソル
     * @returns {Promise<{ ids: number[], has_more: boolean, next_cursor?: string }>}
     */
    getIds({ tab, limit, offset, cursor }?: {
        tab?: "foryou" | "following";
        limit?: number;
        offset?: number;
        cursor?: string;
    }): Promise<{
        ids: number[];
        has_more: boolean;
        next_cursor?: string;
    }>;
    /**
     * 投稿を取得します。
     *
     * @param {number} postId - 投稿 ID
     * @returns {Promise<{ post: object }>}
     *
     * @example
     * const { post } = await client.posts.get(123);
     */
    get(postId: number): Promise<{
        post: object;
    }>;
    /**
     * 投稿のリプライ一覧を取得します。
     *
     * @param {number} postId - 投稿 ID
     * @param {object} [params]
     * @param {number} [params.limit=20] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {string} [params.cursor] - キーセットカーソル
     * @returns {Promise<{ replies: object[], has_more: boolean, next_cursor?: string|null, offset: number, limit: number }>}
     */
    getReplies(postId: number, { limit, offset, cursor }?: {
        limit?: number;
        offset?: number;
        cursor?: string;
    }): Promise<{
        replies: object[];
        has_more: boolean;
        next_cursor?: string | null;
        offset: number;
        limit: number;
    }>;
    /**
     * 投稿のスレッドを取得します。
     *
     * @param {number} postId - 投稿 ID
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ post: object, replies: object[], has_more: boolean, offset: number, limit: number }>}
     */
    getThread(postId: number, { limit, offset }?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        post: object;
        replies: object[];
        has_more: boolean;
        offset: number;
        limit: number;
    }>;
    /**
     * 投稿の引用ポスト一覧を取得します。
     *
     * @param {number} postId - 投稿 ID
     * @param {object} [params]
     * @param {number} [params.limit=20] - 取得件数
     * @param {number} [params.offset=0] - 互換用（Serverは無視します。ページング不可）
     * @returns {Promise<{ quotes: object[] }>}
     */
    getQuotes(postId: number, { limit, offset }?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        quotes: object[];
    }>;
    /**
     * 新しい投稿を作成します。
     *
     * @param {object} params
     * @param {string} [params.content] - 投稿本文
     * @param {number} [params.replyToId] - 返信先の投稿 ID
     * @param {number} [params.quoteId] - 引用・リポストする投稿 ID
     * @param {Array<object>} [params.attachments] - 添付ファイル/投票一覧
     * @param {boolean} [params.mask=false] - 閲覧注意マスクフラグ
     * @param {boolean} [params.lock=false] - フォロワー限定公開フラグ
     * @param {boolean} [params.announcement=false] - アナウンス投稿フラグ
     * @param {string} [params.groupId] - グループ内投稿時のグループID
     * @param {boolean} [params.groupAnnouncement=false] - グループ内アナウンスフラグ
     * @param {'everyone'|'following'|'mentioned_only'} [params.replyControl='everyone'] - 返信可能範囲
     * @param {number} [params.postAsUserId] - インポスター等の代理投稿ユーザーID
     * @param {string|null} [params.scheduledAt] - 投稿日時
     * @returns {Promise<{ success: boolean, queued: boolean, action_id?: string }>}
     *
     * @example
     * // 通常投稿
     * await client.posts.create({ content: 'こんにちは！' });
     */
    create({ content, replyToId, quoteId, attachments, mask, lock, announcement, groupId, groupAnnouncement, replyControl, postAsUserId, scheduledAt, }?: {
        content?: string;
        replyToId?: number;
        quoteId?: number;
        attachments?: Array<object>;
        mask?: boolean;
        lock?: boolean;
        announcement?: boolean;
        groupId?: string;
        groupAnnouncement?: boolean;
        replyControl?: "everyone" | "following" | "mentioned_only";
        postAsUserId?: number;
        scheduledAt?: string | null;
    }): Promise<{
        success: boolean;
        queued: boolean;
        action_id?: string;
    }>;
    /**
     * 投稿を編集・更新します。
     *
     * @param {number} postId - 投稿 ID
     * @param {object} params
     * @param {string} params.content - 更新後の投稿本文
     * @param {Array<object>} [params.attachments] - 添付ファイル
     * @param {boolean} [params.mask] - 閲覧注意マスク
     * @param {boolean} [params.lock] - 鍵
     * @param {'everyone'|'following'|'mentioned_only'} [params.replyControl] - 返信可能範囲
     * @returns {Promise<{ success: boolean, queued: boolean, action_id?: string }>}
     */
    update(postId: number, { content, attachments, mask, lock, replyControl }?: {
        content: string;
        attachments?: Array<object>;
        mask?: boolean;
        lock?: boolean;
        replyControl?: "everyone" | "following" | "mentioned_only";
    }): Promise<{
        success: boolean;
        queued: boolean;
        action_id?: string;
    }>;
    /**
     * `update()` のエイリアスです。
     */
    edit(postId: any, params: any): Promise<{
        success: boolean;
        queued: boolean;
        action_id?: string;
    }>;
    /**
     * 投稿を削除します。
     *
     * @param {number} postId - 削除する投稿 ID
     * @returns {Promise<{ success: boolean, queued: boolean, action_id?: string }>}
     */
    delete(postId: number): Promise<{
        success: boolean;
        queued: boolean;
        action_id?: string;
    }>;
    /**
     * 投稿にいいねをつけます。
     *
     * @param {number} postId - いいねする投稿 ID
     * @returns {Promise<{ success: boolean, liked: boolean, count: number, updated_likes: number[] }>}
     */
    like(postId: number): Promise<{
        success: boolean;
        liked: boolean;
        count: number;
        updated_likes: number[];
    }>;
    /**
     * 投稿のいいねを取り消します。
     *
     * @param {number} postId - いいねを取り消す投稿 ID
     * @returns {Promise<{ success: boolean, liked: boolean, count: number, updated_likes: number[] }>}
     */
    unlike(postId: number): Promise<{
        success: boolean;
        liked: boolean;
        count: number;
        updated_likes: number[];
    }>;
    /**
     * 投稿をスターします。
     *
     * @param {number} postId - スターする投稿 ID
     * @returns {Promise<{ success: boolean, starred: boolean, count: number, updated_stars: number[] }>}
     */
    star(postId: number): Promise<{
        success: boolean;
        starred: boolean;
        count: number;
        updated_stars: number[];
    }>;
    /**
     * 投稿のスターを取り消します。
     *
     * @param {number} postId - スターを取り消す投稿 ID
     * @returns {Promise<{ success: boolean, starred: boolean, count: number, updated_stars: number[] }>}
     */
    unstar(postId: number): Promise<{
        success: boolean;
        starred: boolean;
        count: number;
        updated_stars: number[];
    }>;
    /**
     * 投稿をリポストします。
     *
     * @param {number} postId - リポストする投稿 ID
     * @returns {Promise<{ success: boolean, post: object }>}
     */
    repost(postId: number): Promise<{
        success: boolean;
        post: object;
    }>;
    /**
     * リポストを取り消します。
     *
     * @param {number} repostPostId - 削除するリポスト投稿の ID
     * @returns {Promise<{ success: boolean }>}
     */
    unrepost(repostPostId: number): Promise<{
        success: boolean;
    }>;
    /**
     * 指定した投稿のリポスト一覧を取得します。
     *
     * @param {number} postId - 投稿 ID
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @returns {Promise<{ reposts: object[] }>}
     */
    getReposts(postId: number, { limit }?: {
        limit?: number;
    }): Promise<{
        reposts: object[];
    }>;
    /**
     * 投稿をプロフィールにピン留め / 解除します。
     *
     * @param {number} postId - ピン留めする投稿 ID
     * @returns {Promise<{ success: boolean, pinned: boolean, pin_id: number|null }>}
     */
    pin(postId: number): Promise<{
        success: boolean;
        pinned: boolean;
        pin_id: number | null;
    }>;
    /**
     * 複数の投稿 ID を一括で詳細データに変換します。
     *
     * @param {number[]} postIds - 取得する投稿 ID 配列
     * @returns {Promise<{ posts: object[] }>}
     */
    hydrate(postIds: number[]): Promise<{
        posts: object[];
    }>;
    /**
     * 複数の投稿 ID のメトリクスを一括取得します。
     *
     * @param {number[]} postIds - 投稿 ID 配列
     * @returns {Promise<{ metrics: Array<{ post_id: number, like_count: number, star_count: number, reply_count: number, repost_count: number }> }>}
     */
    getMetrics(postIds: number[]): Promise<{
        metrics: Array<{
            post_id: number;
            like_count: number;
            star_count: number;
            reply_count: number;
            repost_count: number;
        }>;
    }>;
}

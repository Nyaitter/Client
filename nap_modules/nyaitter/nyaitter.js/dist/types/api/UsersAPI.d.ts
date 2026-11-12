/**
 * ユーザーオブジェクトまたはユーザー ID から、適切なアカウントアイコン URL を生成して返します。
 *
 * @param {object|number|string} user - ユーザーオブジェクトまたはユーザー ID
 * @param {object} [options]
 * @param {string} [options.baseUrl] - サーバーのベース URL
 * @returns {string} アイコンの URL
 */
export function getUserIconUrl(user: object | number | string, { baseUrl }?: {
    baseUrl?: string;
}): string;
export class UsersAPI {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.js").NyaitterClient);
    _client: import("../NyaitterClient.js").NyaitterClient;
    /**
     * ユーザーオブジェクトまたはユーザー ID から、適切なアカウントアイコン URL を返します。
     *
     * @param {object|number|string} user - ユーザーオブジェクトまたはユーザー ID
     * @returns {string} アイコンの URL
     */
    getIconUrl(user: object | number | string): string;
    /**
     * ユーザー ID でプロフィールを取得します。
     *
     * @param {number} userId - ユーザー ID
     * @returns {Promise<{ user: import('../models.js').User }>}
     */
    get(userId: number): Promise<{
        user: import("../models.js").User;
    }>;
    /**
     * ログイン中のユーザー情報を取得します。
     *
     * @returns {Promise<{ user: import('../models.js').User, isBot: boolean, tokenType: string }>}
     */
    getMe(): Promise<{
        user: import("../models.js").User;
        isBot: boolean;
        tokenType: string;
    }>;
    getScheduled(userId: any, { limit, offset }?: {
        limit?: number;
        offset?: number;
    }): Promise<any>;
    /** 管理者専用。対象ユーザーの管理ステータスを取得します。 */
    getUserStatus(userId: any): Promise<any>;
    /** 管理者専用。対象ユーザーの管理ステータスを更新します。 */
    updateUserStatus(userId: any, body?: {}): Promise<any>;
    /** 管理者専用。対象ユーザーの管理属性を更新します。 */
    updateUser(userId: any, body?: {}): Promise<any>;
    prepareAccountDeletion(): Promise<any>;
    deleteAccount(confirmationToken: any): Promise<any>;
    /** @returns {Promise<import('../models.js').UserStatus>} */
    getStatus(): Promise<import("../models.js").UserStatus>;
    /**
     * 管理者が利用制限を指定・解除します。
     * @param {number|string} userId
     * @param {{banned: boolean, reason: string}} params - 理由は10文字以上
     * @returns {Promise<{success: boolean}>}
     */
    moderateTrust(userId: number | string, { banned, reason }?: {
        banned: boolean;
        reason: string;
    }): Promise<{
        success: boolean;
    }>;
    /**
     * 管理者が削除済みノートの実績を取り消します。
     * @param {number|string} userId
     * @param {{noteId: number, reason: string}} params - 理由は10文字以上
     * @returns {Promise<{success: boolean}>}
     */
    retractNoteOutcome(userId: number | string, { noteId, reason }?: {
        noteId: number;
        reason: string;
    }): Promise<{
        success: boolean;
    }>;
    /**
     * ユーザー名でユーザーを検索・取得します。
     *
     * @param {string} handle - ユーザー名
     * @returns {Promise<{ user: import('../models.js').User|null }>}
     */
    getByHandle(handle: string): Promise<{
        user: import("../models.js").User | null;
    }>;
    /**
     * ユーザーを検索します。
     *
     * @param {object} params
     * @param {string} params.query - 検索キーワード
     * @param {number} [params.limit=20] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {string|null} [params.cursor=null] - ページネーションカーソル
     * @returns {Promise<{ users: import('../models.js').User[], has_more?: boolean, next_cursor?: string|null }>}
     */
    search({ query, limit, offset, cursor }?: {
        query: string;
        limit?: number;
        offset?: number;
        cursor?: string | null;
    }): Promise<{
        users: import("../models.js").User[];
        has_more?: boolean;
        next_cursor?: string | null;
    }>;
    /**
     * おすすめユーザー一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=20] - 互換用に受理しますが、現行Serverは無視します。
     * @param {number} [params.offset=0] - 互換用に受理しますが、現行Serverは無視します。
     * Serverは件数・offsetを受け付けず固定件数を返します（optionsは旧互換のため受理しますが送信しません）。
     * @returns {Promise<{ users: import('../models.js').User[] }>}
     */
    getRecommended({ limit, offset }?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        users: import("../models.js").User[];
    }>;
    /**
     * 複数のユーザー ID からユーザー情報を一括取得します。
     *
     * @param {number[]|string} userIds - ユーザー ID の配列またはカンマ区切り文字列
     * @returns {Promise<{ users: import('../models.js').User[] }>}
     */
    getBatch(userIds: number[] | string): Promise<{
        users: import("../models.js").User[];
    }>;
    /**
     * `getBatch()` のエイリアスです。
     */
    getUsers(userIds: any): Promise<{
        users: import("../models.js").User[];
    }>;
    /**
     * ユーザーのカウント情報を取得します。
     *
     * @param {number} userId - ユーザー ID
     * @returns {Promise<{ post_count: number, media_count: number, follower_count: number, following_count: number }>}
     */
    getCounts(userId: number): Promise<{
        post_count: number;
        media_count: number;
        follower_count: number;
        following_count: number;
    }>;
    /**
     * ユーザーが投稿したメディア一覧を取得します。
     *
     * @param {number} userId - ユーザー ID
     * @param {object} [params]
     * @param {number} [params.limit=15] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {string} [params.type] - メディア種類 ('image' | 'video')
     * @param {string} [params.cursor] - キーセットカーソル
     * @returns {Promise<{ media_items: object[], next_cursor?: string|null }>}
     */
    getMedia(userId: number, { limit, offset, type, cursor }?: {
        limit?: number;
        offset?: number;
        type?: string;
        cursor?: string;
    }): Promise<{
        media_items: object[];
        next_cursor?: string | null;
    }>;
    /**
     * ユーザーが非公開アカウントかどうかを取得します。
     *
     * @param {number} userId - ユーザー ID
     * @returns {Promise<{ lock: boolean }>}
     */
    isLocked(userId: number): Promise<{
        lock: boolean;
    }>;
    /**
     * ユーザーの投稿一覧を取得します。
     *
     * @param {number} userId - ユーザー ID
     * @param {object} [params]
     * @param {'all'|'posts'|'replies'} [params.mode='all'] - 投稿の絞り込み
     * @param {number} [params.limit=20] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ posts: object[], has_more: boolean }>}
     */
    getPosts(userId: number, { limit, offset, mode }?: {
        mode?: "all" | "posts" | "replies";
        limit?: number;
        offset?: number;
    }): Promise<{
        posts: object[];
        has_more: boolean;
    }>;
    /**
     * ユーザーがいいねした投稿一覧を取得します。
     *
     * @param {number} userId - ユーザー ID
     * @param {object} [params]
     * @param {number} [params.limit=30] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ posts: object[], has_more: boolean }>}
     */
    getLikes(userId: number, { limit, offset }?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        posts: object[];
        has_more: boolean;
    }>;
    /**
     * ユーザーがスターした投稿一覧を取得します。
     *
     * @param {number} userId - ユーザー ID
     * @param {object} [params]
     * @param {number} [params.limit=30] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ posts: object[], has_more: boolean }>}
     */
    getStars(userId: number, { limit, offset }?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        posts: object[];
        has_more: boolean;
    }>;
    /**
     * ユーザーのフォロワー一覧を取得します。
     *
     * @param {number} userId - ユーザー ID
     * @param {object} [params]
     * @param {number} [params.limit=20] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {string|null} [params.cursor=null] - ページネーションカーソル
     * @returns {Promise<{ followers: import('../models.js').User[], has_more: boolean, next_cursor?: string|null }>}
     */
    getFollowers(userId: number, { limit, offset, cursor }?: {
        limit?: number;
        offset?: number;
        cursor?: string | null;
    }): Promise<{
        followers: import("../models.js").User[];
        has_more: boolean;
        next_cursor?: string | null;
    }>;
    /**
     * ユーザーのフォロー中一覧を取得します。
     *
     * @param {number} userId - ユーザー ID
     * @param {object} [params]
     * @param {number} [params.limit=20] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {string|null} [params.cursor=null] - ページネーションカーソル
     * @returns {Promise<{ following: import('../models.js').User[], has_more: boolean, next_cursor?: string|null }>}
     */
    getFollowing(userId: number, { limit, offset, cursor }?: {
        limit?: number;
        offset?: number;
        cursor?: string | null;
    }): Promise<{
        following: import("../models.js").User[];
        has_more: boolean;
        next_cursor?: string | null;
    }>;
    /**
     * ユーザーの固定投稿 ID を取得します。
     * 名前は複数形ですが、現行Serverの `GET /users/:id/pin` は固定投稿を1件だけ持ち、
     * 戻り値は単数の `{ pin_id }` です（投稿の配列ではありません）。
     *
     * @param {number} userId - ユーザー ID
     * @returns {Promise<{ pin_id: number|null }>}
     */
    getPinnedPosts(userId: number): Promise<{
        pin_id: number | null;
    }>;
    /**
     * ユーザーをフォローします。
     *
     * @param {number} userId - フォローするユーザー ID
     * @returns {Promise<{ success: boolean, following: boolean, updated_follows: number[] }>}
     */
    follow(userId: number): Promise<{
        success: boolean;
        following: boolean;
        updated_follows: number[];
    }>;
    /**
     * ユーザーのフォローを解除します。
     *
     * @param {number} userId - フォロー解除するユーザー ID
     * @returns {Promise<{ success: boolean, following: boolean, updated_follows: number[] }>}
     */
    unfollow(userId: number): Promise<{
        success: boolean;
        following: boolean;
        updated_follows: number[];
    }>;
    /**
     * ユーザーのブロック状態を切り替えます（ブロック/ブロック解除）。
     *
     * @param {number} userId - ブロック切り替えするユーザー ID
     * @returns {Promise<{ success: boolean, blocked: boolean, block: number[], user_id: number }>}
     */
    toggleBlock(userId: number): Promise<{
        success: boolean;
        blocked: boolean;
        block: number[];
        user_id: number;
    }>;
    /**
     * ユーザーをブロックします。
     *
     * @param {number} userId - ブロックするユーザー ID
     * @returns {Promise<{ success: boolean, blocked: boolean, block: number[], user_id: number }>}
     */
    block(userId: number): Promise<{
        success: boolean;
        blocked: boolean;
        block: number[];
        user_id: number;
    }>;
    /**
     * ユーザーのブロックを解除します。
     *
     * @param {number} userId - ブロック解除するユーザー ID
     * @returns {Promise<{ success: boolean, blocked: boolean, block: number[], user_id: number }>}
     */
    unblock(userId: number): Promise<{
        success: boolean;
        blocked: boolean;
        block: number[];
        user_id: number;
    }>;
    /**
     * 自分のプロフィールや設定を更新します。
     *
     * @param {object} params
     * @param {string} [params.name] - 表示名
     * @param {string} [params.me] - 自己紹介文（bioの互換alias。両方指定時はServer側でbioが優先）
     * @param {string} [params.bio] - 自己紹介文（meの互換alias。両方指定時はServer側でbioが優先）
     * @param {string} [params.headerImage] - ヘッダー画像 URL / データ
     * @param {string} [params.iconData] - アイコン画像データ
     * @param {import('../models.js').UserSettings} [params.settings] - 表示設定を含む設定。表示ランクの各項目は null で解除
     * @returns {Promise<{ user: import('../models.js').User }>}
     */
    updateProfile({ name, me, bio, headerImage, iconData, settings }?: {
        name?: string;
        me?: string;
        bio?: string;
        headerImage?: string;
        iconData?: string;
        settings?: import("../models.js").UserSettings;
    }): Promise<{
        user: import("../models.js").User;
    }>;
    /**
     * 管理者専用。ログイン履歴・ログを取得します（通常の認証権限では利用できません）。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ logs: object[] }>}
     */
    getLogs({ limit, offset }?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        logs: object[];
    }>;
}

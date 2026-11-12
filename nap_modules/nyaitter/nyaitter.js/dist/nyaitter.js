var Nyaitter = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.js
  var index_exports = {};
  __export(index_exports, {
    AppealsAPI: () => AppealsAPI,
    AuthAPI: () => AuthAPI,
    CallsAPI: () => CallsAPI,
    DmAPI: () => DmAPI,
    ExtensionsAPI: () => ExtensionsAPI,
    GroupsAPI: () => GroupsAPI,
    ImpostersAPI: () => ImpostersAPI,
    NotesAPI: () => NotesAPI,
    NotificationsAPI: () => NotificationsAPI,
    NyaitterAuthAPI: () => NyaitterAuthAPI,
    NyaitterClient: () => NyaitterClient,
    NyaitterError: () => NyaitterError,
    OEmbedAPI: () => OEmbedAPI,
    PollsAPI: () => PollsAPI,
    PostsAPI: () => PostsAPI,
    PushAPI: () => PushAPI,
    RankingAPI: () => RankingAPI,
    RealtimeClient: () => RealtimeClient,
    ReportsAPI: () => ReportsAPI,
    RulesAPI: () => RulesAPI,
    SpacesAPI: () => SpacesAPI,
    SystemAPI: () => SystemAPI,
    UIAPI: () => UIAPI,
    UploadsAPI: () => UploadsAPI,
    UrlCardsAPI: () => UrlCardsAPI,
    UsersAPI: () => UsersAPI,
    VerificationAPI: () => VerificationAPI,
    getGroupIconUrl: () => getGroupIconUrl,
    getUserIconUrl: () => getUserIconUrl
  });

  // src/api/AuthAPI.js
  var AuthAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    getProviders() {
      return this._client._get("/auth/providers");
    }
    verifyProvider(provider, body = {}) {
      return this._client._post(`/auth/${encodeURIComponent(provider)}/verify`, body);
    }
    pollLoginApproval(id, approvalToken) {
      return this._client._post(`/auth/login-approvals/${encodeURIComponent(id)}/poll`, { approval_token: approvalToken });
    }
    getLinkedProviders() {
      return this._client._get("/auth/linked-providers");
    }
    initiateProvider(provider, body = {}) {
      return this._client._post(`/auth/${encodeURIComponent(provider)}/initiate`, body);
    }
    initiateProviderLink(provider, body = {}) {
      return this._client._post(`/auth/link/${encodeURIComponent(provider)}/initiate`, body);
    }
    verifyProviderLink(provider, body = {}) {
      return this._client._post(`/auth/link/${encodeURIComponent(provider)}/verify`, body);
    }
    unlinkProvider(provider, providerUserId) {
      return this._client._delete(`/auth/link/${encodeURIComponent(provider)}`, { provider_user_id: providerUserId });
    }
    getLoginApproval(id) {
      return this._client._get(`/auth/login-approvals/${encodeURIComponent(id)}`);
    }
    decideLoginApproval(id, decision) {
      return this._client._post(`/auth/login-approvals/${encodeURIComponent(id)}/decision`, { decision });
    }
    /** @param {{approvalId?: string, approvalToken?: string}} [params] */
    startAccountRecovery({ approvalId, approvalToken } = {}) {
      return this._client._post("/auth/account-recovery/start", { approval_id: approvalId, approval_token: approvalToken });
    }
    pollAccountRecovery(id, recoveryToken) {
      return this._client._post(`/auth/account-recovery/${encodeURIComponent(id)}/poll`, { recovery_token: recoveryToken });
    }
    getAccountRecovery(id) {
      return this._client._get(`/auth/account-recovery/${encodeURIComponent(id)}`);
    }
    decideAccountRecovery(id, decision) {
      return this._client._post(`/auth/account-recovery/${encodeURIComponent(id)}/decision`, { decision });
    }
    getBlockedIps() {
      return this._client._get("/auth/blocked-ips");
    }
    deleteBlockedIp(hash) {
      return this._client._delete(`/auth/blocked-ips/${encodeURIComponent(hash)}`);
    }
    trustCurrentIp() {
      return this._client._post("/auth/login-security/trust-current-ip", {});
    }
    revokeSessionIp(id) {
      return this._client._post(`/auth/sessions/${encodeURIComponent(id)}/revoke-ip`, {});
    }
    switchImposter(id) {
      return this._client._post(`/auth/imposters/${encodeURIComponent(id)}/switch`, {});
    }
    verifyTurnstile(token) {
      return this._client._post("/auth/turnstile/verify", { token });
    }
    devLogin(username) {
      return this._client._post("/auth/dev-login", { username });
    }
    testProtected() {
      return this._client._get("/auth/test-protected");
    }
    createBotToken(name) {
      return this._client._post("/auth/bot-tokens", { name });
    }
    getBotTokens() {
      return this._client._get("/auth/bot-tokens");
    }
    deleteBotToken(id) {
      return this._client._delete(`/auth/bot-tokens/${encodeURIComponent(id)}`);
    }
    getProvidersResponse() {
      return this._client.requestResponse("/auth/providers");
    }
    pollLoginApprovalResponse(approvalId, approvalToken) {
      return this._client.requestResponse(`/auth/login-approvals/${encodeURIComponent(approvalId)}/poll`, {
        method: "POST",
        body: { approval_token: approvalToken }
      });
    }
    generateScratchResponse(username) {
      return this._client.requestResponse("/auth/scratch/generate", {
        method: "POST",
        body: { type: "generateCode", username }
      });
    }
    verifyScratchResponse(body) {
      return this._client.requestResponse("/auth/scratch/verify", { method: "POST", body });
    }
    initiateEmailResponse(email) {
      return this._client.requestResponse("/auth/email/initiate", { method: "POST", body: { email } });
    }
    verifyEmailResponse(body) {
      return this._client.requestResponse("/auth/email/verify", { method: "POST", body });
    }
    initiatePasskeyResponse(body = {}) {
      return this._client.requestResponse("/auth/passkey/initiate", { method: "POST", body });
    }
    verifyPasskeyResponse(body) {
      return this._client.requestResponse("/auth/passkey/verify", { method: "POST", body });
    }
    initiateNyaitterResponse(body) {
      return this._client.requestResponse("/auth/nyaitter/initiate", { method: "POST", body });
    }
    verifyProviderResponse(provider, body) {
      return this._client.requestResponse(`/auth/${encodeURIComponent(provider)}/verify`, {
        method: "POST",
        body
      });
    }
    /**
     * ログアウトします。
     *
     * @returns {Promise<{ message: string }>}
     */
    logout() {
      return this._client._post("/auth/logout", {});
    }
    /**
     * ログイン中のユーザー情報を取得します。
     *
     * @returns {Promise<{ user: object, isBot: boolean, tokenType: string }>}
     */
    getMe() {
      return this._client._get("/auth/me");
    }
    /**
     * 連携されているサブアカウント一覧を取得します。
     *
     * @returns {Promise<{ accounts: object[] }>}
     */
    getAccounts() {
      return this._client._get("/auth/accounts");
    }
    /**
     * 操作対象のアカウントを切り替えます。
     *
     * @param {object} params
     * @param {number} params.accountId - 切り替え先のアカウント ID
     * @param {number} [params.userId] - 切り替え先のユーザー ID
     * @returns {Promise<{ success: boolean, user: object }>}
     */
    switchAccount({ accountId, userId = accountId } = {}) {
      return this._client._post("/auth/accounts/switch", { user_id: userId });
    }
    /**
     * 記憶済みアカウントを解除します（provider連携の解除ではありません）。
     *
     * @param {number} accountId - 解除するアカウント ID
     * @returns {Promise<{ success: boolean }>}
     */
    unlinkAccount(accountId) {
      return this._client._delete(`/auth/accounts/${encodeURIComponent(accountId)}`);
    }
    /**
     * アクティブなログインセッション一覧を取得します。
     *
     * @returns {Promise<{ sessions: object[] }>}
     */
    getSessions() {
      return this._client._get("/auth/sessions");
    }
    /**
     * 指定したログインセッションを取り消しします。
     *
     * @param {string} sessionId - セッション ID
     * @returns {Promise<{ success: boolean }>}
     */
    revokeSession(sessionId) {
      return this._client._delete(`/auth/sessions/${encodeURIComponent(sessionId)}`);
    }
  };

  // src/api/PostsAPI.js
  var PostsAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * 最新投稿一覧を取得します。
     * @param {{tab?: string, limit?: number, offset?: number, beforeId?: number, sinceId?: number, cursor?: string, order?: string}} [params]
     */
    list({ tab, limit, offset, beforeId, sinceId, cursor, order } = {}) {
      return this._client._get("/posts", { tab, limit, offset, before_id: beforeId, since_id: sinceId, cursor, order });
    }
    /** 投稿のアクティビティを取得します。 */
    getActivity(postId) {
      return this._client._get(`/posts/${encodeURIComponent(postId)}/activity`);
    }
    /** 投稿にいいねしたユーザーを取得します。 */
    getLikes(postId, { limit = 50 } = {}) {
      return this._client._get(`/posts/${encodeURIComponent(postId)}/likes`, { limit });
    }
    /** 投稿を低評価します。 */
    dislike(postId) {
      return this._client._post(`/posts/${encodeURIComponent(postId)}/dislike`, {});
    }
    /** 管理者として投稿を削除します。 */
    adminDelete(postId) {
      return this._client._delete(`/posts/admin/${encodeURIComponent(postId)}`);
    }
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
    getTimeline({ tab = "foryou", limit = 20, offset = 0, beforeId, cursor } = {}) {
      return this._client._get("/posts/page", {
        mode: "timeline",
        tab,
        limit,
        offset,
        before_id: beforeId,
        ...cursor !== void 0 && cursor !== null ? { cursor } : {}
      });
    }
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
    getRecommended({ limit = 20, offset = 0, beforeId, cursor } = {}) {
      return this._client._get("/posts/recommended", {
        limit,
        offset,
        before_id: beforeId,
        ...cursor !== void 0 && cursor !== null ? { cursor } : {}
      });
    }
    /**
     * トレンド投稿一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=20] - 取得件数
     * @returns {Promise<{ posts: object[] }>}
     */
    getTrending({ limit = 20 } = {}) {
      return this._client._get("/posts/trending", { limit });
    }
    /**
     * トレンドハッシュタグ一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=10] - 取得件数
     * @returns {Promise<{ trends: Array<{ tag: string, count: number }> }>}
     */
    getTrendingHashtags({ limit = 10 } = {}) {
      return this._client._get("/posts/trending-hashtags", { limit });
    }
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
    search({ query, limit = 20, offset = 0, beforeId, cursor } = {}) {
      return this._client._get("/posts/search", {
        q: query,
        limit,
        offset,
        before_id: beforeId,
        ...cursor !== void 0 && cursor !== null ? { cursor } : {}
      });
    }
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
    getPage({
      mode = "timeline",
      tab = "foryou",
      query,
      userId,
      subType = "all",
      pinId,
      ids,
      limit = 30,
      offset = 0,
      beforeId,
      cursor
    } = {}) {
      return this._client._get("/posts/page", {
        mode,
        tab,
        q: query,
        user_id: userId,
        sub_type: subType,
        pin_id: pinId,
        ids: Array.isArray(ids) ? ids.join(",") : ids,
        limit,
        offset,
        before_id: beforeId,
        ...cursor !== void 0 && cursor !== null ? { cursor } : {}
      });
    }
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
    getIds({ tab = "foryou", limit = 30, offset = 0, cursor } = {}) {
      return this._client._get("/posts/ids", {
        tab,
        limit,
        offset,
        ...cursor !== void 0 && cursor !== null ? { cursor } : {}
      });
    }
    /**
     * 投稿を取得します。
     *
     * @param {number} postId - 投稿 ID
     * @returns {Promise<{ post: object }>}
     *
     * @example
     * const { post } = await client.posts.get(123);
     */
    get(postId) {
      return this._client._get(`/posts/${postId}`);
    }
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
    getReplies(postId, { limit = 20, offset = 0, cursor } = {}) {
      return this._client._get(`/posts/${postId}/replies`, {
        limit,
        offset,
        ...cursor !== void 0 && cursor !== null ? { cursor } : {}
      });
    }
    /**
     * 投稿のスレッドを取得します。
     *
     * @param {number} postId - 投稿 ID
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ post: object, replies: object[], has_more: boolean, offset: number, limit: number }>}
     */
    getThread(postId, { limit = 50, offset = 0 } = {}) {
      return this._client._get(`/posts/${postId}/thread`, { limit, offset });
    }
    /**
     * 投稿の引用ポスト一覧を取得します。
     *
     * @param {number} postId - 投稿 ID
     * @param {object} [params]
     * @param {number} [params.limit=20] - 取得件数
     * @param {number} [params.offset=0] - 互換用（Serverは無視します。ページング不可）
     * @returns {Promise<{ quotes: object[] }>}
     */
    getQuotes(postId, { limit = 20, offset = 0 } = {}) {
      return this._client._get(`/posts/${postId}/quotes`, { limit });
    }
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
    create({
      content,
      replyToId,
      quoteId,
      attachments,
      mask = false,
      lock = false,
      announcement = false,
      groupId,
      groupAnnouncement = false,
      replyControl = "everyone",
      postAsUserId,
      scheduledAt
    } = {}) {
      return this._client._post("/posts", {
        content,
        reply_to: replyToId,
        repost_to: quoteId,
        attachments,
        mask: Boolean(mask),
        lock: Boolean(lock),
        announcement: Boolean(announcement),
        group_id: groupId,
        group_announcement: Boolean(groupAnnouncement),
        reply_control: replyControl,
        post_as_user_id: postAsUserId,
        scheduled_at: scheduledAt
      });
    }
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
    update(postId, { content, attachments, mask, lock, replyControl } = {}) {
      return this._client._put(`/posts/${encodeURIComponent(postId)}`, {
        content,
        attachments,
        mask,
        lock,
        reply_control: replyControl
      });
    }
    /**
     * `update()` のエイリアスです。
     */
    edit(postId, params) {
      return this.update(postId, params);
    }
    /**
     * 投稿を削除します。
     *
     * @param {number} postId - 削除する投稿 ID
     * @returns {Promise<{ success: boolean, queued: boolean, action_id?: string }>}
     */
    delete(postId) {
      return this._client._delete(`/posts/${postId}`);
    }
    /**
     * 投稿にいいねをつけます。
     *
     * @param {number} postId - いいねする投稿 ID
     * @returns {Promise<{ success: boolean, liked: boolean, count: number, updated_likes: number[] }>}
     */
    like(postId) {
      return this._client._post(`/posts/${postId}/like`, {});
    }
    /**
     * 投稿のいいねを取り消します。
     *
     * @param {number} postId - いいねを取り消す投稿 ID
     * @returns {Promise<{ success: boolean, liked: boolean, count: number, updated_likes: number[] }>}
     */
    unlike(postId) {
      return this.like(postId);
    }
    /**
     * 投稿をスターします。
     *
     * @param {number} postId - スターする投稿 ID
     * @returns {Promise<{ success: boolean, starred: boolean, count: number, updated_stars: number[] }>}
     */
    star(postId) {
      return this._client._post(`/posts/${postId}/star`, {});
    }
    /**
     * 投稿のスターを取り消します。
     *
     * @param {number} postId - スターを取り消す投稿 ID
     * @returns {Promise<{ success: boolean, starred: boolean, count: number, updated_stars: number[] }>}
     */
    unstar(postId) {
      return this.star(postId);
    }
    /**
     * 投稿をリポストします。
     *
     * @param {number} postId - リポストする投稿 ID
     * @returns {Promise<{ success: boolean, post: object }>}
     */
    repost(postId) {
      return this._client._post(`/posts/${postId}/repost`, {});
    }
    /**
     * リポストを取り消します。
     *
     * @param {number} repostPostId - 削除するリポスト投稿の ID
     * @returns {Promise<{ success: boolean }>}
     */
    unrepost(repostPostId) {
      return this.delete(repostPostId);
    }
    /**
     * 指定した投稿のリポスト一覧を取得します。
     *
     * @param {number} postId - 投稿 ID
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @returns {Promise<{ reposts: object[] }>}
     */
    getReposts(postId, { limit = 50 } = {}) {
      return this._client._get(`/posts/${postId}/reposts`, { limit });
    }
    /**
     * 投稿をプロフィールにピン留め / 解除します。
     *
     * @param {number} postId - ピン留めする投稿 ID
     * @returns {Promise<{ success: boolean, pinned: boolean, pin_id: number|null }>}
     */
    pin(postId) {
      return this._client._post(`/posts/${postId}/pin`, {});
    }
    /**
     * 複数の投稿 ID を一括で詳細データに変換します。
     *
     * @param {number[]} postIds - 取得する投稿 ID 配列
     * @returns {Promise<{ posts: object[] }>}
     */
    hydrate(postIds) {
      return this._client._post("/posts/hydrate", { post_ids: postIds });
    }
    /**
     * 複数の投稿 ID のメトリクスを一括取得します。
     *
     * @param {number[]} postIds - 投稿 ID 配列
     * @returns {Promise<{ metrics: Array<{ post_id: number, like_count: number, star_count: number, reply_count: number, repost_count: number }> }>}
     */
    getMetrics(postIds) {
      return this._client._post("/posts/metrics", { post_ids: postIds });
    }
  };

  // src/api/NotesAPI.js
  var NotesAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * @param {number|string} postId
     * @param {object} params
     * @param {string} params.content - 1〜1000文字
     * @param {(string|{url: string, title?: string})[]} [params.sources] - HTTPS の出典
     * @param {string[]} [params.reasons] - create 側の理由コード（最大3件）
     * @returns {Promise<{note: import('../models.js').CommunityNote}>}
     */
    create(postId, { content, sources, reasons } = {}) {
      return this._client._post(`/posts/${encodeURIComponent(postId)}/notes`, { content, sources, reasons });
    }
    /**
     * @param {number|string} postId
     * @returns {Promise<{notes: import('../models.js').CommunityNote[], eligible: boolean}>}
     */
    list(postId) {
      return this._client._get(`/posts/${encodeURIComponent(postId)}/notes`);
    }
    /**
     * 複数の投稿のノートを一括で取得します（タイムライン表示時の N+1 回避用）。
     * 閲覧できない・存在しない投稿は結果に含まれず、`missing_post_ids` に入ります。
     *
     * @param {(number|string)[]} postIds - 投稿 ID（最大50件、重複は除かれます）
     * @returns {Promise<{notes_by_post: Record<string, {notes: import('../models.js').CommunityNote[], eligible: boolean}>, missing_post_ids: number[]}>}
     */
    listForPosts(postIds) {
      const ids = [...new Set((Array.isArray(postIds) ? postIds : []).map((id) => Number(id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
      return this._client._post("/notes/bulk", { post_ids: ids });
    }
    /**
     * @param {object} [params]
     * @param {'create'|'positive'|'negative'} [params.side]
     * @returns {Promise<{tags: import('../models.js').NoteReasonTag[]}>}
     */
    getReasonTags({ side } = {}) {
      return this._client._get("/notes/reason-tags", { side });
    }
    /**
     * @param {number|string} noteId
     * @param {object} params
     * @param {boolean} params.helpful
     * @param {string[]} [params.reasons] - positive / negative 側の理由コード（最大3件）
     * @returns {Promise<import('../models.js').NoteRatingSummary & {reasons: string[]}>}
     */
    rate(noteId, { helpful, reasons } = {}) {
      return this._client._post(`/notes/${encodeURIComponent(noteId)}/ratings`, { helpful, reasons });
    }
    /**
     * @param {number|string} noteId
     * @returns {Promise<{success: boolean}>}
     */
    delete(noteId) {
      return this._client._delete(`/notes/${encodeURIComponent(noteId)}`);
    }
    /**
     * 管理者がノートを再判定します。
     * @param {number|string} noteId
     * @returns {Promise<{note: import('../models.js').CommunityNote}>}
     */
    reEvaluate(noteId) {
      return this._client._post(`/notes/${encodeURIComponent(noteId)}/re-evaluate`, {});
    }
  };

  // src/api/PollsAPI.js
  var PollsAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * 投票データを取得します。
     *
     * @param {string} pollId - 投票 ID
     * @returns {Promise<{ poll: object }>}
     *
     * @example
     * const { poll } = await client.polls.get('poll-id');
     * console.log('選択肢:', poll.options);
     */
    get(pollId) {
      return this._client._get(`/polls/${encodeURIComponent(pollId)}`);
    }
    /**
     * 投票を実行します。
     *
     * @param {string} pollId - 投票 ID
     * @param {object} params
     * @param {number[]|number} [params.optionIds] - 投票する選択肢のインデックス配列
     * @param {string} [params.otherText] - 「その他」選択時の自由記述テキスト
     * @returns {Promise<{ poll: object }>}
     *
     * @example
     * const { poll } = await client.polls.vote('poll-id', {
     *   optionIds: [0],
     * });
     */
    vote(pollId, { optionIds, otherText } = {}) {
      const rawIds = Array.isArray(optionIds) ? optionIds : optionIds !== void 0 && optionIds !== null ? [optionIds] : [];
      return this._client._post(`/polls/${encodeURIComponent(pollId)}/vote`, {
        option_ids: rawIds,
        other_text: otherText
      });
    }
  };

  // src/api/UsersAPI.js
  function getUserIconUrl(user, { baseUrl = "" } = {}) {
    const base = baseUrl ? String(baseUrl).replace(/\/+$/, "") : "";
    if (!user && user !== 0) {
      return base ? `${base}/emoji/neko.svg` : "/emoji/neko.svg";
    }
    if (typeof user === "number" || typeof user === "string" && /^\d+$/.test(user.trim())) {
      const id = typeof user === "number" ? user : parseInt(user.trim(), 10);
      if (Number.isSafeInteger(id) && id > 0) {
        return `${base}/users/${encodeURIComponent(String(id))}/icon`;
      }
    }
    if (typeof user === "object" && user !== null) {
      if (user.icon_available === false) {
        return base ? `${base}/emoji/neko.svg` : "/emoji/neko.svg";
      }
      const iconData = typeof user.icon_data === "string" ? user.icon_data.trim() : typeof user.iconData === "string" ? user.iconData.trim() : "";
      if (iconData) {
        if (/^data:image\//i.test(iconData) || /^https?:\/\//i.test(iconData)) {
          return iconData;
        }
        if (iconData.startsWith("/")) {
          return `${base}${iconData}`;
        }
        return `${base}/${iconData}`;
      }
      const userId = Number(user.id);
      if (Number.isSafeInteger(userId) && userId > 0) {
        return `${base}/users/${encodeURIComponent(String(userId))}/icon`;
      }
    }
    return base ? `${base}/emoji/neko.svg` : "/emoji/neko.svg";
  }
  var UsersAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * ユーザーオブジェクトまたはユーザー ID から、適切なアカウントアイコン URL を返します。
     *
     * @param {object|number|string} user - ユーザーオブジェクトまたはユーザー ID
     * @returns {string} アイコンの URL
     */
    getIconUrl(user) {
      return getUserIconUrl(user, { baseUrl: this._client._baseUrl });
    }
    /**
     * ユーザー ID でプロフィールを取得します。
     *
     * @param {number} userId - ユーザー ID
     * @returns {Promise<{ user: import('../models.js').User }>}
     */
    get(userId) {
      return this._client._get(`/users/${encodeURIComponent(userId)}`);
    }
    /**
     * ログイン中のユーザー情報を取得します。
     *
     * @returns {Promise<{ user: import('../models.js').User, isBot: boolean, tokenType: string }>}
     */
    getMe() {
      return this._client._get("/auth/me");
    }
    getScheduled(userId, { limit = 30, offset = 0 } = {}) {
      return this._client._get(`/users/${encodeURIComponent(userId)}/scheduled`, { limit, offset });
    }
    /** 管理者専用。対象ユーザーの管理ステータスを取得します。 */
    getUserStatus(userId) {
      return this._client._get(`/users/${encodeURIComponent(userId)}/status`);
    }
    /** 管理者専用。対象ユーザーの管理ステータスを更新します。 */
    updateUserStatus(userId, body = {}) {
      return this._client._put(`/users/${encodeURIComponent(userId)}/status`, body);
    }
    /** 管理者専用。対象ユーザーの管理属性を更新します。 */
    updateUser(userId, body = {}) {
      return this._client._put(`/users/${encodeURIComponent(userId)}`, body);
    }
    prepareAccountDeletion() {
      return this._client._post("/users/me/account/delete/prepare", {});
    }
    deleteAccount(confirmationToken) {
      return this._client._delete("/users/me/account", { confirmation_token: confirmationToken });
    }
    /** @returns {Promise<import('../models.js').UserStatus>} */
    getStatus() {
      return this._client._get("/users/me/status");
    }
    /**
     * 管理者が利用制限を指定・解除します。
     * @param {number|string} userId
     * @param {{banned: boolean, reason: string}} params - 理由は10文字以上
     * @returns {Promise<{success: boolean}>}
     */
    moderateTrust(userId, { banned, reason } = {}) {
      return this._client._post(`/users/${encodeURIComponent(userId)}/trust-moderation`, { banned, reason });
    }
    /**
     * 管理者が削除済みノートの実績を取り消します。
     * @param {number|string} userId
     * @param {{noteId: number, reason: string}} params - 理由は10文字以上
     * @returns {Promise<{success: boolean}>}
     */
    retractNoteOutcome(userId, { noteId, reason } = {}) {
      return this._client._post(`/users/${encodeURIComponent(userId)}/note-outcome-retract`, { noteId, reason });
    }
    /**
     * ユーザー名でユーザーを検索・取得します。
     *
     * @param {string} handle - ユーザー名
     * @returns {Promise<{ user: import('../models.js').User|null }>}
     */
    async getByHandle(handle) {
      const cleanHandle = String(handle || "").replace(/^[@#]/, "").trim();
      if (!cleanHandle) return { user: null };
      const numericId = parseInt(cleanHandle, 10);
      if (Number.isInteger(numericId) && numericId >= 0 && String(numericId) === cleanHandle) {
        try {
          const res = await this.get(numericId);
          if (res?.user) return res;
        } catch (_) {
        }
      }
      const { users = [] } = await this.search({ query: cleanHandle, limit: 10 });
      const exact = users.find(
        (u) => String(u.scid || "").toLowerCase() === cleanHandle.toLowerCase() || String(u.name || "").toLowerCase() === cleanHandle.toLowerCase() || String(u.id) === cleanHandle
      );
      if (exact) {
        return this.get(exact.id);
      }
      return { user: users[0] ? (await this.get(users[0].id)).user : null };
    }
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
    search({ query, limit = 20, offset = 0, cursor = null } = {}) {
      return this._client._get("/users/search", {
        q: query,
        limit,
        offset: cursor ? void 0 : offset,
        cursor: cursor || void 0
      });
    }
    /**
     * おすすめユーザー一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=20] - 互換用に受理しますが、現行Serverは無視します。
     * @param {number} [params.offset=0] - 互換用に受理しますが、現行Serverは無視します。
     * Serverは件数・offsetを受け付けず固定件数を返します（optionsは旧互換のため受理しますが送信しません）。
     * @returns {Promise<{ users: import('../models.js').User[] }>}
     */
    getRecommended({ limit = 20, offset = 0 } = {}) {
      void limit;
      void offset;
      return this._client._get("/users/recommended");
    }
    /**
     * 複数のユーザー ID からユーザー情報を一括取得します。
     *
     * @param {number[]|string} userIds - ユーザー ID の配列またはカンマ区切り文字列
     * @returns {Promise<{ users: import('../models.js').User[] }>}
     */
    getBatch(userIds) {
      const ids = Array.isArray(userIds) ? userIds.join(",") : userIds;
      return this._client._get("/users", { ids });
    }
    /**
     * `getBatch()` のエイリアスです。
     */
    getUsers(userIds) {
      return this.getBatch(userIds);
    }
    /**
     * ユーザーのカウント情報を取得します。
     *
     * @param {number} userId - ユーザー ID
     * @returns {Promise<{ post_count: number, media_count: number, follower_count: number, following_count: number }>}
     */
    getCounts(userId) {
      return this._client._get(`/users/${encodeURIComponent(userId)}/counts`);
    }
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
    getMedia(userId, { limit = 15, offset = 0, type, cursor } = {}) {
      return this._client._get(`/users/${encodeURIComponent(userId)}/media`, {
        limit,
        offset,
        ...type ? { type } : {},
        ...cursor !== void 0 && cursor !== null ? { cursor } : {}
      });
    }
    /**
     * ユーザーが非公開アカウントかどうかを取得します。
     *
     * @param {number} userId - ユーザー ID
     * @returns {Promise<{ lock: boolean }>}
     */
    isLocked(userId) {
      return this._client._get(`/users/${encodeURIComponent(userId)}/is-lock`);
    }
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
    getPosts(userId, { limit = 20, offset = 0, mode = "all" } = {}) {
      return this._client._get(`/users/${encodeURIComponent(userId)}/posts`, { limit, offset, mode });
    }
    /**
     * ユーザーがいいねした投稿一覧を取得します。
     *
     * @param {number} userId - ユーザー ID
     * @param {object} [params]
     * @param {number} [params.limit=30] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ posts: object[], has_more: boolean }>}
     */
    getLikes(userId, { limit = 30, offset = 0 } = {}) {
      return this._client._get(`/users/${encodeURIComponent(userId)}/likes`, { limit, offset });
    }
    /**
     * ユーザーがスターした投稿一覧を取得します。
     *
     * @param {number} userId - ユーザー ID
     * @param {object} [params]
     * @param {number} [params.limit=30] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ posts: object[], has_more: boolean }>}
     */
    getStars(userId, { limit = 30, offset = 0 } = {}) {
      return this._client._get(`/users/${encodeURIComponent(userId)}/stars`, { limit, offset });
    }
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
    getFollowers(userId, { limit = 20, offset = 0, cursor = null } = {}) {
      return this._client._get(`/users/${encodeURIComponent(userId)}/followers`, {
        limit,
        offset: cursor ? void 0 : offset,
        cursor: cursor || void 0
      });
    }
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
    getFollowing(userId, { limit = 20, offset = 0, cursor = null } = {}) {
      return this._client._get(`/users/${encodeURIComponent(userId)}/following`, {
        limit,
        offset: cursor ? void 0 : offset,
        cursor: cursor || void 0
      });
    }
    /**
     * ユーザーの固定投稿 ID を取得します。
     * 名前は複数形ですが、現行Serverの `GET /users/:id/pin` は固定投稿を1件だけ持ち、
     * 戻り値は単数の `{ pin_id }` です（投稿の配列ではありません）。
     *
     * @param {number} userId - ユーザー ID
     * @returns {Promise<{ pin_id: number|null }>}
     */
    getPinnedPosts(userId) {
      return this._client._get(`/users/${encodeURIComponent(userId)}/pin`);
    }
    /**
     * ユーザーをフォローします。
     *
     * @param {number} userId - フォローするユーザー ID
     * @returns {Promise<{ success: boolean, following: boolean, updated_follows: number[] }>}
     */
    follow(userId) {
      return this._client._post(`/users/${encodeURIComponent(userId)}/follow`, {});
    }
    /**
     * ユーザーのフォローを解除します。
     *
     * @param {number} userId - フォロー解除するユーザー ID
     * @returns {Promise<{ success: boolean, following: boolean, updated_follows: number[] }>}
     */
    unfollow(userId) {
      return this.follow(userId);
    }
    /**
     * ユーザーのブロック状態を切り替えます（ブロック/ブロック解除）。
     *
     * @param {number} userId - ブロック切り替えするユーザー ID
     * @returns {Promise<{ success: boolean, blocked: boolean, block: number[], user_id: number }>}
     */
    toggleBlock(userId) {
      return this._client._post(`/users/${encodeURIComponent(userId)}/block`, {});
    }
    /**
     * ユーザーをブロックします。
     *
     * @param {number} userId - ブロックするユーザー ID
     * @returns {Promise<{ success: boolean, blocked: boolean, block: number[], user_id: number }>}
     */
    block(userId) {
      return this.toggleBlock(userId);
    }
    /**
     * ユーザーのブロックを解除します。
     *
     * @param {number} userId - ブロック解除するユーザー ID
     * @returns {Promise<{ success: boolean, blocked: boolean, block: number[], user_id: number }>}
     */
    unblock(userId) {
      return this.toggleBlock(userId);
    }
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
    updateProfile({ name, me, bio, headerImage, iconData, settings } = {}) {
      return this._client._put("/users/me", {
        name,
        me,
        bio,
        header_image: headerImage,
        icon_data: iconData,
        settings
      });
    }
    /**
     * 管理者専用。ログイン履歴・ログを取得します（通常の認証権限では利用できません）。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ logs: object[] }>}
     */
    getLogs({ limit = 50, offset = 0 } = {}) {
      return this._client._get("/users/logs", { limit, offset });
    }
  };

  // src/api/DmAPI.js
  var DmAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * DM の一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数（Server の既定値）
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ dm: object[], members: object[], unread_total: number }>}
     *
     * @example
     * const { dm, unread_total } = await client.dm.list();
     */
    list({ limit = 50, offset = 0 } = {}) {
      return this._client._get("/dm", { limit, offset });
    }
    /**
     * `list()` のエイリアスです。
     */
    getRooms(params) {
      return this.list(params);
    }
    /**
     * 全体の DM 未読件数を取得します。
     *
     * @returns {Promise<{ unread_count: number }>}
     */
    getUnreadCount() {
      return this._client._get("/dm/unread");
    }
    /**
     * DM グループごとの未読件数マップを取得します。
     *
     * @returns {Promise<{ unread_total: number, unread_by_dm: Record<string, number> }>}
     */
    getUnreadCounts() {
      return this._client._get("/dm/unread-counts");
    }
    /** 指定ユーザーの DM 公開鍵を取得します。 */
    getKeys(userIds) {
      return this._client._get("/dm/keys", { user_ids: Array.isArray(userIds) ? userIds.join(",") : userIds });
    }
    /** 自分の DM 公開鍵を登録します。 */
    setKey(publicKey) {
      return this._client._post("/dm/keys", { public_key: publicKey });
    }
    /** DM を削除します。 */
    delete(dmId) {
      return this._client._delete(`/dm/${encodeURIComponent(dmId)}`);
    }
    /** DM の招待を受諾します。 */
    accept(dmId) {
      return this._client._post(`/dm/${encodeURIComponent(dmId)}/accept`, {});
    }
    /** DM の招待を拒否します。 */
    decline(dmId) {
      return this._client._post(`/dm/${encodeURIComponent(dmId)}/decline`, {});
    }
    /**
     * 指定ユーザーとの既存の 1対1 DM グループを検索します。
     *
     * @param {number|{ userId: number }} params - 相手のユーザー ID
     * @returns {Promise<{ dm: object|null }>}
     */
    find(params) {
      const userId = typeof params === "object" && params !== null ? params.userId : params;
      return this._client._get("/dm/find", { user_id: userId });
    }
    /**
     * DM グループの詳細を取得します。
     *
     * @param {string} dmId - DM グループ ID
     * @param {object} [params]
     * @param {number} [params.limit] - 互換のため受け取るだけです。現行Serverの GET /dm/:dmId は limit/offset を無視して全メッセージを返すため、送信しません。
     * @param {number} [params.offset] - 同上（送信しません）
     * @param {boolean} [params.markRead] - 取得時に既読にする
     * @returns {Promise<{ dm: object[], members: object[], unread_total: number }>}
     */
    get(dmId, { limit, offset, markRead } = {}) {
      void limit;
      void offset;
      return this._client._get(`/dm/${encodeURIComponent(dmId)}`, { mark_read: markRead === void 0 || markRead === null ? markRead : markRead ? "1" : "0" });
    }
    /**
     * `get()` のエイリアスです。
     */
    getRoom(dmId, params) {
      return this.get(dmId, params);
    }
    /**
     * 新しい DM グループを作成します。
     *
     * @param {object} params
     * @param {number[]} params.members - 招待するユーザー ID の配列
     * @param {string} [params.title] - グループ名
     * @param {string} [params.name] - グループ名
     * @returns {Promise<{ dm: object, created: boolean }>}
     */
    create({ members, title, name } = {}) {
      return this._client._post("/dm", {
        member: members,
        title: title !== void 0 ? title : name
      });
    }
    /**
     * DM グループのタイトルや設定を更新します。
     *
     * @param {string} dmId - DM グループ ID
     * @param {object} params
     * @param {string} [params.title] - グループ名
     * @param {number[]} [params.members]
     * @param {number[]} [params.member]
     * @param {number} [params.hostId]
     * @param {object[]} [params.post]
     * @param {string} [params.stateVersion] - 取得した DM の state_version。post を更新するときは必須です。競合時は再取得してください。
     * @returns {Promise<{ dm: object }>}
     */
    updateRoom(dmId, { title, members, member, hostId, post, stateVersion } = {}) {
      return this._client._put(`/dm/${encodeURIComponent(dmId)}`, { title, member: member !== void 0 ? member : members, host_id: hostId, post, ...stateVersion === void 0 ? {} : { state_version: stateVersion } });
    }
    /**
     * DM グループから脱退します。
     *
     * @param {string} dmId - DM グループ ID
     * @returns {Promise<{ success: boolean }>}
     */
    leave(dmId) {
      return this._client._post(`/dm/${encodeURIComponent(dmId)}/leave`, {});
    }
    /**
     * DM グループにメッセージを送信します。
     *
     * @param {string} dmId - DM グループ ID
     * @param {object} params
     * @param {string} [params.content] - メッセージ本文
     * @param {Array<object>} [params.attachments] - 添付ファイル
     * @param {object} [params.e2e] - E2E 暗号化ペイロード
     * @param {string} [params.reply_to] - 同じ会話内の返信先メッセージ ID
     * @param {string} [params.requestId] - 再送時に再利用する UUID（サーバーの対応が必要）
     * @param {{content?: string, attachments?: Array<object>, e2e?: object, reply_to?: string}} [params.message]
     * @returns {Promise<{ dm: object, message: object }>}
     */
    sendMessage(dmId, { message, requestId, ...fields } = {}) {
      return this._client._post(`/dm/${encodeURIComponent(dmId)}/messages`, { message: message !== void 0 ? message : fields, ...requestId === void 0 ? {} : { request_id: requestId } });
    }
    /**
     * 送信済みメッセージを編集します。
     *
     * @param {string} dmId - DM グループ ID
     * @param {string|number} messageId - メッセージ ID
     * @param {object} params
     * @param {string} params.content - 編集後のメッセージ本文
     * @returns {Promise<{ success: boolean, message: object }>}
     */
    editMessage(dmId, messageId, { content } = {}) {
      return this._client._patch(`/dm/${encodeURIComponent(dmId)}/messages/${encodeURIComponent(messageId)}`, { content });
    }
    /**
     * 自分の送信済みメッセージを削除します。
     *
     * @param {string} dmId - DM グループ ID
     * @param {string|number} messageId - 削除するメッセージ ID
     * @returns {Promise<{ success: boolean }>}
     */
    deleteMessage(dmId, messageId) {
      return this._client._delete(`/dm/${encodeURIComponent(dmId)}/messages/${encodeURIComponent(messageId)}`);
    }
    /**
     * DM グループのメッセージを既読にします。
     *
     * @param {string} dmId - DM グループ ID
     * @param {object} [params]
     * @param {string|number} [params.messageId] - 互換用（サーバーは指定を無視します）
     * @returns {Promise<{ success: boolean }>}
     */
    markAsRead(dmId, { messageId } = {}) {
      return this._client._post(`/dm/${encodeURIComponent(dmId)}/read`, {
        message_id: messageId
      });
    }
  };

  // src/api/CallsAPI.js
  var CallsAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * 参加可能なステージを検索・取得します。
     *
     * @param {object} [params]
     * @param {string} [params.query] - 検索キーワード（最大200文字）
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ stages: object[], has_more: boolean }>}
     *
     * @example
     * const { stages } = await client.calls.listStages({ query: '雑談' });
     */
    listStages({ query, offset = 0 } = {}) {
      return this._client._get("/calls/stages", { query, offset });
    }
    /**
     * ステージを開始、または未来の日時で予約します。
     *
     * @param {object} params
     * @param {string} params.name - ステージ名
     * @param {string} [params.description] - 説明（最大2000文字）
     * @param {'public'|'group'|'private'} [params.visibility='public'] - 公開範囲
     * @param {string} [params.group_id] - `visibility` が `'group'` のときの対象グループ ID
     * @param {string} [params.groupId]
     * @param {string} [params.scheduled_at] - 予約開始日時（ISO 8601、未来のみ）
     * @param {string} [params.scheduledAt]
     * @param {number[]} [params.invite_ids] - 招待するユーザー ID の配列
     * @param {number[]} [params.inviteIds]
     * @param {number[]} [params.speaker_ids] - スピーカーにするユーザー ID の配列
     * @param {number[]} [params.speakerIds]
     * @param {boolean} [params.allow_guest_join] - ゲスト参加を許可するか
     * @param {boolean} [params.allowGuestJoin]
     * @returns {Promise<{ stage: object }>}
     *
     * @example
     * const { stage } = await client.calls.createStage({ name: 'はじめてのステージ' });
     */
    createStage({
      name,
      description,
      visibility,
      group_id,
      groupId,
      scheduled_at,
      scheduledAt,
      invite_ids,
      inviteIds,
      speaker_ids,
      speakerIds,
      allow_guest_join,
      allowGuestJoin
    } = {}) {
      return this._client._post("/calls/stages", {
        name,
        description,
        visibility,
        group_id: group_id !== void 0 ? group_id : groupId,
        scheduled_at: scheduled_at !== void 0 ? scheduled_at : scheduledAt,
        invite_ids: invite_ids !== void 0 ? invite_ids : inviteIds,
        speaker_ids: speaker_ids !== void 0 ? speaker_ids : speakerIds,
        allow_guest_join: allow_guest_join !== void 0 ? allow_guest_join : allowGuestJoin
      });
    }
    /**
     * ステージの参加情報を取得します。
     * 応答には WebRTC 接続に使う `ice_servers` と `ice_transport_policy` が含まれます。
     *
     * @param {string} id - ステージ ID
     * @returns {Promise<{ stage: object, role: string, guest: boolean, host: object, participants: object[], ice_transport_policy: string, bundle_policy: string, rtcp_mux_policy: string, ice_servers: object[] }>}
     *
     * @example
     * const info = await client.calls.getStage(stage.id);
     */
    getStage(id) {
      return this._client._get(`/calls/stages/${encodeURIComponent(id)}`);
    }
    /**
     * ステージの状態・スピーカー・招待・ゲスト参加設定を更新します（ホストのみ）。
     *
     * @param {string} id - ステージ ID
     * @param {object} [params]
     * @param {'live'|'ended'} [params.status] - ステージの状態
     * @param {number[]} [params.speaker_ids] - スピーカーにするユーザー ID の配列
     * @param {number[]} [params.speakerIds]
     * @param {number[]} [params.invite_ids] - 追加で招待するユーザー ID の配列
     * @param {number[]} [params.inviteIds]
     * @param {boolean} [params.allow_guest_join] - ゲスト参加を許可するか
     * @param {boolean} [params.allowGuestJoin]
     * @returns {Promise<{ stage: object }>}
     */
    updateStage(id, { status, speaker_ids, speakerIds, invite_ids, inviteIds, allow_guest_join, allowGuestJoin } = {}) {
      return this._client._patch(`/calls/stages/${encodeURIComponent(id)}`, {
        status,
        speaker_ids: speaker_ids !== void 0 ? speaker_ids : speakerIds,
        invite_ids: invite_ids !== void 0 ? invite_ids : inviteIds,
        allow_guest_join: allow_guest_join !== void 0 ? allow_guest_join : allowGuestJoin
      });
    }
    /**
     * 未ログインのゲストとしてステージに参加するためのセッションを発行します。
     * 実際の制御は `client.realtime()` の `call:*` メッセージで行います。
     *
     * @param {string} id - ステージ ID
     * @returns {Promise<{ guest_id: string }>}
     */
    createGuestSession(id) {
      return this._client._post(`/calls/stages/${encodeURIComponent(id)}/guest-session`);
    }
    /**
     * 発行済みのゲスト参加セッションを終了します。
     *
     * @returns {Promise<{ ok: boolean }>}
     */
    deleteGuestSession() {
      return this._client._delete("/calls/stages/guest-session");
    }
    /**
     * DM 通話の参加情報を取得します。
     * 応答には WebRTC 接続に使う `ice_servers` と `ice_transport_policy` が含まれます。
     *
     * @param {string} dmId - DM グループ ID
     * @returns {Promise<{ title: string, members: object[], participants: object[], active: boolean, ice_transport_policy: string, bundle_policy: string, rtcp_mux_policy: string, ice_servers: object[] }>}
     *
     * @example
     * const call = await client.calls.getDmCall('dm_group_id');
     */
    getDmCall(dmId) {
      return this._client._get(`/calls/dm/${encodeURIComponent(dmId)}`);
    }
    /**
     * 参加情報レスポンスから WebRTC 用の ICE 設定を取り出します。
     *
     * @param {object} info - `getStage()` または `getDmCall()` の戻り値
     * @returns {{ iceServers: object[], iceTransportPolicy: string, bundlePolicy: string, rtcpMuxPolicy: string }}
     *
     * @example
     * const pc = new RTCPeerConnection(client.calls.getIceConfig(await client.calls.getStage(id)));
     */
    getIceConfig(info = {}) {
      return {
        iceServers: Array.isArray(info.ice_servers) ? info.ice_servers : [],
        iceTransportPolicy: info.ice_transport_policy || "all",
        // max-bundle で音声・映像を単一トランスポートに集約し、ICE candidate 数・
        // SDP サイズ・接続確立時間を削減する（サーバー未対応時は既定値を使用）。
        bundlePolicy: info.bundle_policy || "max-bundle",
        rtcpMuxPolicy: info.rtcp_mux_policy || "require"
      };
    }
  };

  // src/api/SpacesAPI.js
  var SpacesAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /** 音声通話用の接続設定を取得します。 */
    getIceServers() {
      return this._client._get("/spaces/ice-servers");
    }
    /** @param {{query?: string, limit?: number, offset?: number}} [options] */
    list({ query, limit = 20, offset = 0 } = {}) {
      return this._client._get("/spaces", { query, limit, offset });
    }
    /** @param {{limit?: number, offset?: number}} [options] */
    getMine({ limit = 50, offset = 0 } = {}) {
      return this._client._get("/spaces/mine", { limit, offset });
    }
    /** @param {{name: string, visibility: 'public'|'private'|'group', description?: string, groupId?: number|string, iconData?: string, headerImage?: string}} options - group visibility の場合は有効な groupId も必要です */
    create({ name, description, visibility, groupId, iconData, headerImage } = {}) {
      return this._client._post("/spaces", { name, description, visibility, group_id: groupId, iconData, headerImage });
    }
    /** @param {number|string} spaceId */
    get(spaceId) {
      return this._client._get(`/spaces/${encodeURIComponent(spaceId)}`);
    }
    /**
     * @param {number|string} spaceId
     * @param {{name?: string, description?: string, visibility?: 'public'|'private'|'group', groupId?: number|string, iconData?: string, headerImage?: string}} [options]
     */
    update(spaceId, { name, description, visibility, groupId, iconData, headerImage } = {}) {
      return this._client._patch(`/spaces/${encodeURIComponent(spaceId)}`, { name, description, visibility, group_id: groupId, iconData, headerImage });
    }
    /** @param {number|string} spaceId */
    delete(spaceId) {
      return this._client._delete(`/spaces/${encodeURIComponent(spaceId)}`);
    }
    /** @param {number|string} spaceId */
    join(spaceId) {
      return this._client._post(`/spaces/${encodeURIComponent(spaceId)}/join`, {});
    }
    /** @param {number|string} spaceId */
    leave(spaceId) {
      return this._client._post(`/spaces/${encodeURIComponent(spaceId)}/leave`, {});
    }
    /**
     * @param {number|string} spaceId
     * @param {{limit?: number, offset?: number}} [options]
     */
    getMembers(spaceId, { limit = 100, offset = 0 } = {}) {
      return this._client._get(`/spaces/${encodeURIComponent(spaceId)}/members`, { limit, offset });
    }
    /** @param {number|string} spaceId */
    getChannels(spaceId) {
      return this._client._get(`/spaces/${encodeURIComponent(spaceId)}/channels`);
    }
    /**
     * @param {number|string} spaceId
     * @param {{name?: string, kind?: 'text'|'voice'}} [options]
     */
    createChannel(spaceId, { name, kind } = {}) {
      return this._client._post(`/spaces/${encodeURIComponent(spaceId)}/channels`, { name, kind });
    }
    /**
     * @param {number|string} spaceId
     * @param {number|string} channelId
     * @param {{name?: string, kind?: 'text'|'voice'}} [options]
     */
    updateChannel(spaceId, channelId, { name, kind } = {}) {
      return this._client._patch(`/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}`, { name, kind });
    }
    /**
     * @param {number|string} spaceId
     * @param {number|string} channelId
     */
    deleteChannel(spaceId, channelId) {
      return this._client._delete(`/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}`);
    }
    /**
     * @param {number|string} spaceId
     * @param {number|string} channelId
     * @param {{limit?: number, beforeId?: number|string}} [options]
     */
    getMessages(spaceId, channelId, { limit = 50, beforeId } = {}) {
      return this._client._get(`/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/messages`, { limit, before_id: beforeId });
    }
    /**
     * @param {number|string} spaceId
     * @param {number|string} channelId
     * @param {{content?: string}} [options]
     */
    sendMessage(spaceId, channelId, { content } = {}) {
      return this._client._post(`/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}/messages`, { content });
    }
    /**
     * @param {number|string} spaceId
     * @param {number|string} messageId
     */
    deleteMessage(spaceId, messageId) {
      return this._client._delete(`/spaces/${encodeURIComponent(spaceId)}/messages/${encodeURIComponent(messageId)}`);
    }
  };

  // src/api/NotificationsAPI.js
  var NotificationsAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * 通知一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {string|Date} [params.since] - この日時以降の通知のみ取得
     * @returns {Promise<{ notifications: object[], notification_unread_count: number }>}
     *
     * @example
     * const { notifications, notification_unread_count } = await client.notifications.list();
     * console.log(`未読: ${notification_unread_count} 件`);
     */
    list({ limit = 50, offset = 0, since } = {}) {
      return this._client._get("/notifications", {
        limit,
        offset,
        since: since instanceof Date ? since.toISOString() : since
      });
    }
    /**
     * 未読の通知件数を取得します。
     *
     * @returns {Promise<{ unread_count: number }>}
     *
     * @example
     * const { unread_count } = await client.notifications.getUnreadCount();
     */
    getUnreadCount() {
      return this._client._get("/notifications/unread");
    }
    /**
     * 新しい通知を送信します。
     *
     * @param {object} params
     * @param {number} params.recipientId - 送信先ユーザー ID
     * @param {string} params.type - 通知タイプ。一般ユーザーにはサーバー側の種別・対象制限があります。
     * @param {object} [params.target] - 通知対象
     * @returns {Promise<{ success: boolean, notification: object|null }>}
     *
     * @example
     * await client.notifications.create({
     *   recipientId: 12,
     *   type: 'mention',
     *   target: { kind: 'post', id: 123 },
     * });
     */
    create({ recipientId, type, target } = {}) {
      return this._client._post("/notifications", {
        recipient_id: recipientId,
        type,
        target
      });
    }
    /**
     * 通知を既読にします。
     *
     * @param {number} notificationId - 通知 ID
     * @returns {Promise<{ success: boolean, notification_unread_count: number }>}
     */
    markAsRead(notificationId) {
      return this._client._put(`/notifications/${encodeURIComponent(notificationId)}/read`, {});
    }
    /**
     * 通知をクリック済みにマークします。
     *
     * @param {number} notificationId - 通知 ID
     * @returns {Promise<{ success: boolean, read: boolean, clicked: boolean, notification_unread_count: number }>}
     */
    markAsClicked(notificationId) {
      return this._client._put(`/notifications/${encodeURIComponent(notificationId)}/clicked`, {});
    }
    /**
     * すべての通知を既読にします。
     *
     * @returns {Promise<{ success: boolean, notification_unread_count: number }>}
     *
     * @example
     * await client.notifications.markAllAsRead();
     */
    markAllAsRead() {
      return this._client._put("/notifications/read-all", {});
    }
    /**
     * すべての通知をクリック済みにします。
     *
     * @returns {Promise<{ success: boolean, notification_unread_count: number }>}
     */
    markAllAsClicked() {
      return this._client._put("/notifications/click-all", {});
    }
    /**
     * 通知を削除します。
     *
     * @param {number} notificationId - 削除する通知 ID
     * @returns {Promise<{ success: boolean }>}
     */
    delete(notificationId) {
      return this._client._delete(`/notifications/${encodeURIComponent(notificationId)}`);
    }
  };

  // src/api/GroupsAPI.js
  function getGroupIconUrl(group, { baseUrl = "" } = {}) {
    const base = baseUrl ? String(baseUrl).replace(/\/+$/, "") : "";
    if (!group) return "";
    const rawIcon = typeof group === "object" && group !== null ? group.icon_data ?? group.iconData ?? "" : group;
    const image = typeof rawIcon === "string" ? rawIcon.trim() : "";
    if (!image) return "";
    if (/^data:image\//i.test(image) || /^https?:\/\//i.test(image)) {
      return image;
    }
    if (image.startsWith("/")) {
      return `${base}${image}`;
    }
    return base ? `${base}/${image}` : image;
  }
  var GroupsAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * グループオブジェクトまたはアイコン文字列から、適切なグループアイコン URL を返します。
     *
     * @param {object|string} group - グループオブジェクトまたはアイコン文字列
     * @returns {string} グループアイコンの URL
     *
     * @example
     * const iconUrl = client.groups.getIconUrl(group);
     */
    getIconUrl(group) {
      return getGroupIconUrl(group, { baseUrl: this._client._baseUrl });
    }
    /**
     * 公開グループ一覧を検索・取得します。
     *
     * @param {object} [params]
     * @param {string} [params.query] - 検索キーワード
     * @param {number} [params.limit=20] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ groups: object[] }>}
     *
     * @example
     * const { groups } = await client.groups.list({ query: 'プログラミング' });
     */
    list({ query, limit = 20, offset = 0 } = {}) {
      return this._client._get("/groups", { query, limit, offset });
    }
    /**
     * 自分が所属しているグループ一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.postAsUserId] - 互換用（Serverは無視し、認証中ユーザーの一覧を返します）
     * @param {number} [params.limit=50] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ groups: object[], limit: number, offset: number }>}
     */
    listMine({ postAsUserId, limit = 50, offset = 0 } = {}) {
      return this._client._get("/groups/mine", {
        limit,
        offset
      });
    }
    /**
     * 自分に届いているグループ招待一覧を取得します。
     *
     * @returns {Promise<{ invites: Array<{ id: string, group_id: string, inviter_id: number, invitee_id: number, status: string, group: object|null }> }>}
     */
    getInvitesMine() {
      return this._client._get("/groups/invites/mine");
    }
    /**
     * グループ招待に応答します。
     *
     * @param {string} inviteId - 招待 ID
     * @param {'accept'|'decline'} decision - 応答判定
     * @returns {Promise<{ success: boolean, group?: object }>}
     */
    respondInvite(inviteId, decision) {
      return this._client._post(`/groups/invites/${encodeURIComponent(inviteId)}/respond`, { decision });
    }
    /**
     * グループの詳細情報を取得します。
     *
     * @param {string} groupId - グループ ID
     * @param {{postAsUserId?: number}} [params]
     * @returns {Promise<{ group: object }>}
     *
     * @example
     * const { group } = await client.groups.get('group-uuid');
     */
    get(groupId, { postAsUserId } = {}) {
      return this._client._get(`/groups/${encodeURIComponent(groupId)}`, { post_as_user_id: postAsUserId });
    }
    /**
     * 新しいグループを作成します。
     *
     * @param {object} params
     * @param {string} params.name - グループ名
     * @param {string} [params.description] - グループ説明
     * @param {'open'|'open_invite'|'approval'|'closed'} [params.visibility='open'] - 公開レベル
     * @param {string} [params.iconData] - アイコン画像データ
     * @param {string} [params.headerImage] - ヘッダー画像 URL / データ
     * @param {string} [params.category]
     * @returns {Promise<{ group: object }>}
     *
     * @example
     * const { group } = await client.groups.create({
     *   name: '猫好きクラブ',
     *   description: '猫が好きな人の集まりです',
     *   visibility: 'open',
     * });
     */
    create({ name, description = "", visibility = "open", iconData, headerImage, category } = {}) {
      return this._client._post("/groups", {
        name,
        description,
        visibility,
        icon_data: iconData,
        header_image: headerImage,
        category
      });
    }
    /**
     * グループの基本設定を更新します。
     *
     * @param {string} groupId - グループ ID
     * @param {object} params
     * @param {string} [params.name] - グループ名
     * @param {string} [params.description] - グループ説明
     * @param {'open'|'open_invite'|'approval'|'closed'} [params.visibility] - 公開レベル
     * @param {string} [params.iconData] - アイコン画像データ
     * @param {string} [params.headerImage] - ヘッダー画像 URL / データ
     * @returns {Promise<{ group: object }>}
     */
    update(groupId, { name, description, visibility, iconData, headerImage } = {}) {
      return this._client._patch(`/groups/${encodeURIComponent(groupId)}`, {
        name,
        description,
        visibility,
        icon_data: iconData,
        header_image: headerImage
      });
    }
    /**
     * グループのオーナー権限を別のメンバーに譲渡します。
     *
     * @param {string} groupId - グループ ID
     * @param {number} userId - 新オーナーのユーザー ID
     * @returns {Promise<{ group: object }>}
     */
    transferOwner(groupId, userId) {
      return this._client._post(`/groups/${encodeURIComponent(groupId)}/transfer-owner`, {
        user_id: userId
      });
    }
    /**
     * グループを削除します。
     *
     * @param {string} groupId - グループ ID
     * @returns {Promise<{ success: boolean }>}
     */
    delete(groupId) {
      return this._client._delete(`/groups/${encodeURIComponent(groupId)}`);
    }
    /**
     * グループに参加します。
     *
     * @param {string} groupId - グループ ID
     * @returns {Promise<{ membership: object, joined: true } | { join_request: object, pending: true }>}
     */
    join(groupId) {
      return this._client._post(`/groups/${encodeURIComponent(groupId)}/join`, {});
    }
    /**
     * グループから退出します。
     *
     * @param {string} groupId - グループ ID
     * @returns {Promise<{ success: boolean }>}
     */
    leave(groupId) {
      return this._client._post(`/groups/${encodeURIComponent(groupId)}/leave`, {});
    }
    /**
     * ユーザーをグループに招待します。
     *
     * @param {string} groupId - グループ ID
     * @param {number} userId - 招待するユーザー ID
     * @returns {Promise<{ success: boolean, invite: object }>}
     */
    invite(groupId, userId) {
      return this._client._post(`/groups/${encodeURIComponent(groupId)}/invites`, {
        user_id: userId
      });
    }
    /**
     * 保留中の参加申請一覧を取得します。
     *
     * @param {string} groupId - グループ ID
     * @param {{status?: string}} [params]
     * @returns {Promise<{ requests: object[] }>}
     */
    getJoinRequests(groupId, { status } = {}) {
      return this._client._get(`/groups/${encodeURIComponent(groupId)}/join-requests`, { status });
    }
    /**
     * 参加申請に応答します。
     *
     * @param {string} groupId - グループ ID
     * @param {string} requestId - 参加申請 ID
     * @param {'approve'|'decline'} decision - 判定
     * @returns {Promise<{ join_request: object }>}
     */
    respondJoinRequest(groupId, requestId, decision) {
      return this._client._post(`/groups/${encodeURIComponent(groupId)}/join-requests/${encodeURIComponent(requestId)}/respond`, {
        decision
      });
    }
    /**
     * グループのロール一覧を取得します。
     *
     * @param {string} groupId - グループ ID
     * @returns {Promise<{ roles: object[] }>}
     */
    getRoles(groupId) {
      return this._client._get(`/groups/${encodeURIComponent(groupId)}/roles`);
    }
    /**
     * グループに新しいカスタムロールを作成します。
     *
     * @param {string} groupId - グループ ID
     * @param {object} params
     * @param {string} params.name - ロール名
     * @param {string[]} params.permissions - 権限リスト
     * @param {number} [params.sortOrder=0] - 表示順序
     * @returns {Promise<{ role: object }>}
     */
    createRole(groupId, { name, permissions, sortOrder = 0 } = {}) {
      return this._client._post(`/groups/${encodeURIComponent(groupId)}/roles`, {
        name,
        permissions,
        sort_order: sortOrder
      });
    }
    /**
     * カスタムロールを更新します。
     *
     * @param {string} groupId - グループ ID
     * @param {string} roleId - ロール ID
     * @param {object} params
     * @param {string} [params.name] - ロール名
     * @param {string[]} [params.permissions] - 権限リスト
     * @param {number} [params.sortOrder] - 表示順序
     * @returns {Promise<{ role: object }>}
     */
    updateRole(groupId, roleId, { name, permissions, sortOrder } = {}) {
      return this._client._patch(`/groups/${encodeURIComponent(groupId)}/roles/${encodeURIComponent(roleId)}`, {
        name,
        permissions,
        sort_order: sortOrder
      });
    }
    /**
     * カスタムロールを削除します。
     *
     * @param {string} groupId - グループ ID
     * @param {string} roleId - ロール ID
     * @returns {Promise<{ success: boolean }>}
     */
    deleteRole(groupId, roleId) {
      return this._client._delete(`/groups/${encodeURIComponent(groupId)}/roles/${encodeURIComponent(roleId)}`);
    }
    /**
     * グループメンバー一覧を取得します。
     *
     * @param {string} groupId - グループ ID
     * @param {object} [params]
     * @param {'active'|'pending'|'invited'|'banned'} [params.status='active'] - 取得するステータス
     * @param {number} [params.limit=200] - 互換用（Serverは無視し、固定値200を使用します）
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ members: object[] }>}
     */
    getMembers(groupId, { status = "active", limit = 200, offset = 0 } = {}) {
      return this._client._get(`/groups/${encodeURIComponent(groupId)}/members`, {
        status,
        offset
      });
    }
    /**
     * メンバーのロールを変更します。
     *
     * @param {string} groupId - グループ ID
     * @param {number} userId - 対象ユーザー ID
     * @param {string} roleId - 付与するロール ID
     * @returns {Promise<{ member: object }>}
     */
    updateMember(groupId, userId, roleId) {
      return this._client._patch(`/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, {
        role_id: roleId
      });
    }
    /**
     * メンバーをグループから BAN します。
     *
     * @param {string} groupId - グループ ID
     * @param {number} userId - BAN するユーザー ID
     * @returns {Promise<{ success: boolean }>}
     */
    banMember(groupId, userId) {
      return this._client._post(`/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/ban`, {});
    }
    /**
     * メンバーの BAN を解除します。
     *
     * @param {string} groupId - グループ ID
     * @param {number} userId - BAN 解除するユーザー ID
     * @returns {Promise<{ success: boolean }>}
     */
    unbanMember(groupId, userId) {
      return this._client._post(`/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/unban`, {});
    }
    /**
     * グループ内の投稿一覧を取得します。
     *
     * @param {string} groupId - グループ ID
     * @param {object} [params]
     * @param {number} [params.limit=30] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {number} [params.beforeId] - この ID 以前の投稿を取得
     * @param {string} [params.cursor] - キーセットカーソル
     * @param {number} [params.authorId]
     * @param {string} [params.subType]
     * @param {string} [params.order]
     * @param {string} [params.mode]
     * @returns {Promise<{ posts: object[], has_next: boolean, next_cursor: any }>}
     */
    getPosts(groupId, { limit = 30, offset = 0, beforeId, cursor, authorId, subType, order, mode } = {}) {
      return this._client._get(`/groups/${encodeURIComponent(groupId)}/posts`, {
        limit,
        offset,
        before_id: beforeId,
        author_id: authorId,
        sub_type: subType,
        order,
        mode,
        ...cursor !== void 0 && cursor !== null ? { cursor } : {}
      });
    }
  };

  // src/api/UploadsAPI.js
  var UploadsAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * 直接アップロード先を発行します。
     * @param {object} params
     * @param {string} params.fileName
     * @param {string} [params.contentType]
     * @param {number} [params.asUserId]
     * @param {string} [params.replaceId]
     * @returns {Promise<{id: string, url: string|null, key: string, replaced?: boolean}>}
     */
    prepare({ fileName, contentType, asUserId, replaceId } = {}) {
      return this._client._post("/uploads/prepare", {
        fileName,
        contentType,
        as_user_id: asUserId,
        replaceId
      });
    }
    uploadPartResponse(uploadId, file, { contentType = "application/octet-stream", asUserId = null } = {}) {
      return this._client.requestResponse(`/uploads/${encodeURIComponent(uploadId)}`, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          ...Number.isInteger(asUserId) && asUserId > 0 ? { "X-As-User-Id": String(asUserId) } : {}
        },
        body: file
      });
    }
    /**
     * 画像などのファイルを Nyaitter サーバーにアップロードします。
     *
     * @param {object} params
     * @param {string|Uint8Array|ArrayBuffer|Blob} params.file - ファイルデータ（Node.js の Buffer を含む）
     * @param {string} params.fileName - ファイル名
     * @param {string} [params.contentType='image/png'] - MIME タイプ
     * @param {number} [params.asUserId] - インポスター代理アップロード時のユーザー ID
     * @returns {Promise<{ id: string, url: string, contentType: string, size: number }>}
     */
    async upload({ file, fileName, contentType = "image/png", asUserId } = {}) {
      let base64String = "";
      if (typeof file === "string") {
        base64String = file.replace(/^data:[^;]+;base64,/, "").trim();
      } else if (file instanceof Uint8Array || typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
        if (typeof Buffer !== "undefined") {
          base64String = Buffer.from(file).toString("base64");
        } else {
          let binary = "";
          const bytes = file;
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          base64String = btoa(binary);
        }
      } else if (file instanceof ArrayBuffer) {
        const bytes = new Uint8Array(file);
        if (typeof Buffer !== "undefined") {
          base64String = Buffer.from(bytes).toString("base64");
        } else {
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          base64String = btoa(binary);
        }
      } else if (typeof Blob !== "undefined" && file instanceof Blob) {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        if (typeof Buffer !== "undefined") {
          base64String = Buffer.from(bytes).toString("base64");
        } else {
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          base64String = btoa(binary);
        }
        if (!contentType && file.type) {
          contentType = file.type;
        }
      } else {
        throw new Error("\u30B5\u30DD\u30FC\u30C8\u3055\u308C\u3066\u3044\u306A\u3044\u30D5\u30A1\u30A4\u30EB\u5F62\u5F0F\u3067\u3059\u3002Base64 \u6587\u5B57\u5217\u3001Buffer\u3001Uint8Array\u3001\u307E\u305F\u306F Blob \u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      }
      return this._client._post("/uploads", {
        file: base64String,
        fileName,
        contentType,
        as_user_id: asUserId
      });
    }
    /**
     * 自分のストレージ使用状況とファイル一覧を取得します。
     *
     * @returns {Promise<{ limit_mb: number, limit_bytes: number, used_bytes: number, used_percent: number, files: Array<{ id: string, url: string, size: number, lastModified: string }> }>}
     */
    getStorage() {
      return this._client._get("/uploads/storage");
    }
    /**
     * アップロード済みファイルを削除します。
     *
     * @param {object|string[]} params - 削除するファイル ID リストまたはオプション
     * @param {string[]} [params.fileIds] - ファイル ID 配列
     * @param {number} [params.asUserId] - インポスター代理削除時のユーザー ID
     * @returns {Promise<{ success: boolean, deleted_count: number }>}
     */
    delete(params) {
      const fileIds = Array.isArray(params) ? params : params?.fileIds;
      const asUserId = Array.isArray(params) ? void 0 : params?.asUserId;
      return this._client._delete("/uploads", {
        fileIds,
        as_user_id: asUserId
      });
    }
    /**
     * 添付画像ファイルのサムネイルURL を取得します。
     *
     * @param {string} fileId - ファイル ID
     * @returns {string} プレビュー URL
     */
    getPreviewUrl(fileId) {
      const cleanId = String(fileId || "").trim();
      return `${this._client._baseUrl}/uploads/preview?file_id=${encodeURIComponent(cleanId)}`;
    }
  };

  // src/api/RankingAPI.js
  var RankingAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * 自分のランキング順位を取得します。
     *
     * @returns {Promise<{ followers: { rank: number|null, follower_count: number }, posts: { rank: number|null, post_count: number }, likes: { rank: number|null, like_count: number }, stars: { rank: number|null, star_count: number } }>}
     *
     * @example
     * const myRanks = await client.ranking.getMe();
     * console.log('フォロワー順位:', myRanks.followers.rank);
     */
    getMe() {
      return this._client._get("/ranking/me");
    }
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
    get(type, { limit = 50 } = {}) {
      return this._client._get(`/ranking/${encodeURIComponent(type)}`, { limit });
    }
    /**
     * フォロワー数ランキング上位を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @returns {Promise<{ data: object[] }>}
     */
    getFollowers({ limit = 50 } = {}) {
      return this.get("followers", { limit });
    }
    /**
     * 投稿数ランキング上位を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @returns {Promise<{ data: object[] }>}
     */
    getPosts({ limit = 50 } = {}) {
      return this.get("posts", { limit });
    }
    /**
     * いいね数ランキング上位を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @returns {Promise<{ data: object[] }>}
     */
    getLikes({ limit = 50 } = {}) {
      return this.get("likes", { limit });
    }
    /**
     * スター数ランキング上位を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @returns {Promise<{ data: object[] }>}
     */
    getStars({ limit = 50 } = {}) {
      return this.get("stars", { limit });
    }
  };

  // src/api/ReportsAPI.js
  var ReportsAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /** 管理者専用。割当済み通報を取得します（`required` 認証だけでなくServer側admin権限が必要）。
     * @param {{status?: string, limit?: number, offset?: number}} [params]
     */
    listAssigned({ status, limit = 50, offset = 0 } = {}) {
      return this._client._get("/reports/assigned", { status, limit, offset });
    }
    /** 管理者専用。report assignment種別により `decision`/`actions` 等のbody要件が異なります。 */
    resolve(reportId, body = {}) {
      return this._client._post(`/reports/${encodeURIComponent(reportId)}/resolve`, body);
    }
    retractTrust(reportId, body = {}) {
      return this._client._post(`/reports/${encodeURIComponent(reportId)}/trust-retract`, body);
    }
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
    create({ targetKind, targetId, description, postAsUserId } = {}) {
      return this._client._post("/reports", {
        target_kind: targetKind,
        target_id: targetId,
        description,
        post_as_user_id: postAsUserId
      });
    }
    /**
     * 通報一覧を取得します。
     *
     * @param {object} [params]
     * @param {string} [params.status] - 絞り込みステータス
     * @param {number} [params.limit=50] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ reports: object[] }>}
     */
    list({ status, limit = 50, offset = 0 } = {}) {
      return this._client._get("/reports", { status, limit, offset });
    }
    /**
     * 通報の詳細を取得します。
     *
     * @param {number} reportId - 通報 ID
     * @returns {Promise<{ report: object }>}
     */
    get(reportId) {
      return this._client._get(`/reports/${encodeURIComponent(reportId)}`);
    }
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
    update(reportId, { status, note, action } = {}) {
      return this._client._patch(`/reports/${encodeURIComponent(reportId)}`, {
        status,
        note,
        action
      });
    }
  };

  // src/api/AppealsAPI.js
  var AppealsAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
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
    getStatus() {
      return this._client._get("/appeals/me");
    }
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
    create({ description } = {}) {
      return this._client._post("/appeals", { description });
    }
  };

  // src/api/VerificationAPI.js
  var VerificationAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
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
    getStatus() {
      return this._client._get("/verification-applications/me");
    }
    /**
     * 認証バッジを申請します。
     *
     * @returns {Promise<{ application: { id: number, status: string, assigned_at: string|null, created_at: string|null }|null }>}
     *
     * @example
     * await client.verification.apply();
     */
    apply() {
      return this._client._post("/verification-applications", {});
    }
  };

  // src/api/ImpostersAPI.js
  var ImpostersAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * 自分がアクセス可能なインポスター一覧を取得します。
     *
     * @returns {Promise<{ imposters: object[], limit: number }>}
     *
     * @example
     * const { imposters } = await client.imposters.list();
     */
    list() {
      return this._client._get("/imposters");
    }
    /**
     * 新しいインポスターを作成します。
     *
     * @param {object} params
     * @param {string} params.name - インポスターのアカウント名
     * @returns {Promise<{ imposter: object }>}
     *
     * @example
     * const { imposter } = await client.imposters.create({ name: '広報用インポスター' });
     */
    create({ name } = {}) {
      return this._client._post("/imposters", { name });
    }
    /**
     * インポスターに共同運用者を追加します。
     *
     * @param {number} imposterId - インポスターのユーザー ID
     * @param {object} params
     * @param {number} params.userId - 追加するユーザー ID
     * @param {'operator'|'manager'} [params.role='operator'] - 権限ロール
     * @returns {Promise<{ imposter: object }>}
     */
    addMember(imposterId, { userId, role = "operator" } = {}) {
      return this._client._post(`/imposters/${encodeURIComponent(imposterId)}/members`, {
        user_id: userId,
        role
      });
    }
    /**
     * インポスターの共同運用者の権限ロールを変更します。
     *
     * @param {number} imposterId - インポスターのユーザー ID
     * @param {number} memberId - 運用者のユーザー ID
     * @param {object} params
     * @param {'operator'|'manager'} params.role - 新しい権限ロール
     * @returns {Promise<{ imposter: object }>}
     */
    updateMemberRole(imposterId, memberId, { role } = {}) {
      return this._client._patch(`/imposters/${encodeURIComponent(imposterId)}/members/${encodeURIComponent(memberId)}`, {
        role
      });
    }
    /**
     * インポスターから共同運用者を削除します。
     *
     * @param {number} imposterId - インポスターのユーザー ID
     * @param {number} memberId - 削除する運用者のユーザー ID
     * @returns {Promise<{ imposter: object }>}
     */
    removeMember(imposterId, memberId) {
      return this._client._delete(`/imposters/${encodeURIComponent(imposterId)}/members/${encodeURIComponent(memberId)}`);
    }
    /**
     * インポスターを削除します。
     *
     * @param {number} imposterId - 削除するインポスターのユーザー ID
     * @returns {Promise<{ success: boolean }>}
     */
    delete(imposterId) {
      return this._client._delete(`/imposters/${encodeURIComponent(imposterId)}`);
    }
  };

  // src/api/PushAPI.js
  var PushAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * Web Push 通知のサーバー設定を取得します。
     *
     * @returns {Promise<{ enabled: boolean, vapid_public_key: string|null, subscription_count: number }>}
     */
    getConfig() {
      return this._client._get("/push/config");
    }
    /**
     * ブラウザの PushSubscription をサーバーに登録します。
     *
     * @param {object} params
     * @param {PushSubscription|object} params.subscription - ブラウザの PushSubscription オブジェクト
     * @returns {Promise<{ success: boolean }>}
     */
    subscribe({ subscription } = {}) {
      const subObj = typeof subscription?.toJSON === "function" ? subscription.toJSON() : subscription;
      return this._client._post("/push/subscriptions", { subscription: subObj });
    }
    /**
     * PushSubscription の登録を解除します。
     *
     * @param {string} endpoint - 登録解除する購読エンドポイント URL
     * @returns {Promise<{ success: boolean }>}
     */
    unsubscribe(endpoint) {
      return this._client._delete("/push/subscriptions", { endpoint });
    }
  };

  // src/api/RulesAPI.js
  var RulesAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * サーバーのコミュニティルール・利用規約を取得します。
     *
     * @returns {Promise<{ success: boolean, rules: string, updated_at: string }>}
     *
     * @example
     * const { rules } = await client.rules.get();
     * console.log(rules);
     */
    get() {
      return this._client._get("/rules");
    }
  };

  // src/api/UrlCardsAPI.js
  var UrlCardsAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
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
    get(url) {
      return this._client._get("/url-cards", { url });
    }
  };

  // src/api/OEmbedAPI.js
  var OEmbedAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
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
    get(url, { maxWidth, maxHeight } = {}) {
      return this._client._get("/oembed", {
        url,
        maxwidth: maxWidth,
        maxheight: maxHeight
      });
    }
  };

  // src/api/UIAPI.js
  var UIAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * ナビゲーション表示用の未読カウントサマリーを取得します。
     *
     * @returns {Promise<{ notification_unread_count: number, dm_unread_count: number }>}
     *
     * @example
     * const summary = await client.ui.getSummary();
     * console.log(`未読通知: ${summary.notification_unread_count} 件, 未読DM: ${summary.dm_unread_count} 件`);
     */
    getSummary() {
      return this._client._get("/ui/summary");
    }
  };

  // src/api/SystemAPI.js
  var SystemAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    getStatusResponse() {
      return this._client.requestResponse("/status");
    }
    /** OpenAPI 仕様を取得します。 */
    getOpenApiSpec() {
      return this._client._get("/spec");
    }
    getApiSpecResponse(options) {
      return this._getWithFallback("/spec/endpoints", "/api/spec/endpoints", options);
    }
    getDocsResponse(options) {
      return this._getWithFallback("/docs", "/api/docs", options);
    }
    getDocResponse(docId, options) {
      return this._getWithFallback(`/docs/${encodeURIComponent(docId)}`, `/api/docs/${encodeURIComponent(docId)}`, options);
    }
    getRulesResponse(options) {
      return this._client.requestResponse("/rules", options);
    }
    async _getWithFallback(primaryPath, fallbackPath, options) {
      const response = await this._client.requestResponse(primaryPath, options);
      return response.ok ? response : this._client.requestResponse(fallbackPath, options);
    }
    /**
     * サーバーの稼働状態・制限値・認証プロバイダー設定を取得します。
     *
     * @returns {Promise<import('../models.js').ServerStatus>}
     *
     * @example
     * const status = await client.system.getStatus();
     * console.log('サーバー状態:', status.server, status.database);
     */
    getStatus() {
      return this._client._get("/status");
    }
    /**
     * サーバーのヘルスチェック状態を取得します。
     *
     * @returns {Promise<{ status: string, timestamp: string, version: string, uptime: number, env: string }>}
     */
    getHealth() {
      return this._client._get("/health");
    }
    /**
     * サーバーのレディネス状態を取得します。
     *
     * @returns {Promise<{ status: string, timestamp: string }>}
     */
    getReady() {
      return this._client._get("/ready");
    }
    /**
     * コミュニティルール・利用規約を取得します。
     *
     * @returns {Promise<{ success: boolean, rules: string, updated_at: string }>}
     */
    getRules() {
      return this._client._get("/rules");
    }
    /**
     * 指定した URL の OGP カード情報を取得します。
     *
     * @param {string} url - 展開対象の URL
     * @returns {Promise<{ card: object }>}
     */
    getUrlCard(url) {
      return this._client._get("/url-cards", { url });
    }
    /**
     * Nyaitter 投稿等の oEmbed 埋め込みデータを取得します。
     *
     * @param {string} url - 投稿 URL
     * @returns {Promise<object>} oEmbed JSON レスポンス
     */
    getOembed(url) {
      return this._client._get("/oembed", { url });
    }
    /**
     * ナビゲーション表示用の未読カウントサマリーを取得します。
     *
     * @returns {Promise<{ notification_unread_count: number, dm_unread_count: number }>}
     */
    getUiSummary() {
      return this._client._get("/ui/summary");
    }
  };

  // src/api/NyaitterAuthAPI.js
  var NyaitterAuthAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    getRequest(requestId) {
      return this._client._get(`/nyaitter-auth/requests/${encodeURIComponent(requestId)}`);
    }
    approve(body) {
      return this._client._post("/nyaitter-auth/approve", body);
    }
    deny(body) {
      return this._client._post("/nyaitter-auth/deny", body);
    }
    autoPass(requestId) {
      return this._client._post("/nyaitter-auth/auto-pass", { request_id: requestId });
    }
    checkGrant(query = {}) {
      return this._client._get("/nyaitter-auth/check-grant", query);
    }
    getRequestResponse(requestId, options) {
      return this._client.requestResponse(`/nyaitter-auth/requests/${encodeURIComponent(requestId)}`, options);
    }
    approveResponse(body) {
      return this._client.requestResponse("/nyaitter-auth/approve", { method: "POST", body });
    }
    denyResponse(body) {
      return this._client.requestResponse("/nyaitter-auth/deny", { method: "POST", body });
    }
    /**
     * 認証 URL を生成します。返ってきた `auth_url` にユーザーをリダイレクトしてください。
     *
     * @param {object} params
     * @param {string} params.appId - アプリ ID
     * @param {string} params.redirectUri - 許可後にリダイレクトされる URL
     * @param {string[]} params.scopes - 要求する権限のリスト
     * @param {string} [params.name] - 認証画面に表示されるアプリ名
     * @param {string} [params.iconUrl] - 認証画面に表示されるアイコン URL
     * @param {string} [params.state] - CSRF 対策用の任意文字列
     * @returns {Promise<{ request_id: string, auth_url: string, expires_at: string }>}
     *
     * @example
     * const { auth_url } = await client.nyaitterAuth.initiate({
     *   appId: 'my_app',
     *   redirectUri: 'https://example.com/callback',
     *   scopes: ['profile:read', 'posts:write', 'continuous_access'],
     *   name: '私のアプリ',
     * });
     * // ユーザーを auth_url へ案内する
     */
    initiate({ appId, redirectUri, scopes, name, iconUrl, state } = {}) {
      return this._client._post("/nyaitter-auth/initiate", {
        app_id: appId,
        api_token: this._client.getToken(),
        redirect_uri: redirectUri,
        scopes,
        name,
        icon_url: iconUrl,
        state
      });
    }
    /**
     * ユーザーが許可した後に届いた `code` をアクセストークンと交換します。
     * 取得したトークンで新しい `NyaitterClient` を作成して、そのユーザーとして API を呼び出せます。
     *
     * @param {object} params
     * @param {string} params.appId - アプリ ID
     * @param {string} params.code - コールバック URL の `?code=` の値
     * @returns {Promise<{ user: object, granted_scopes: string[], access_token?: string }>}
     *
     * @example
     * const code = new URLSearchParams(window.location.search).get('code');
     *
     * const { user, access_token } = await client.nyaitterAuth.exchangeToken({
     *   appId: 'my_app',
     *   code,
     * });
     *
     * // 取得したトークンで別クライアントを作る
     * const userClient = new NyaitterClient({
     *   baseUrl: 'https://nyaitter.example.com',
     *   token: access_token,
     * });
     * await userClient.posts.create({ content: 'ユーザーとして投稿！' });
     */
    exchangeToken({ appId, code } = {}) {
      return this._client._post("/nyaitter-auth/token", {
        app_id: appId,
        api_token: this._client.getToken(),
        code
      });
    }
    /**
     * 連携済みアプリの一覧を取得します。
     *
     * @returns {Promise<{ apps: object[] }>}
     */
    getAuthorizedApps() {
      return this._client._get("/nyaitter-auth/authorized-apps");
    }
    /**
     * 現在のアクセストークンで認可されたユーザー情報とスコープを取得します。
     *
     * @returns {Promise<{ success: boolean, user: object, scopes: string[], app_id: string|null }>}
     *
     * @example
     * const info = await userClient.nyaitterAuth.getUserInfo();
     * console.log(`連携ユーザー: ${info.user.name}, スコープ:`, info.scopes);
     */
    getUserInfo() {
      return this._client._get("/nyaitter-auth/userinfo");
    }
    /**
     * 連携済みアプリのスコープを更新します。
     *
     * @param {string} appAuthId - 連携 ID
     * @param {string[]} scopes - 新しいスコープ一覧
     * @returns {Promise<{ success: boolean }>}
     */
    updateAuthorizedApp(appAuthId, scopes) {
      return this._client._patch(`/nyaitter-auth/authorized-apps/${encodeURIComponent(appAuthId)}`, { scopes });
    }
    /**
     * 連携済みアプリを解除します。
     *
     * @param {string} appAuthId - 連携 ID
     * @returns {Promise<{ success: boolean }>}
     */
    revokeAuthorizedApp(appAuthId) {
      return this._client._delete(`/nyaitter-auth/authorized-apps/${encodeURIComponent(appAuthId)}`);
    }
  };

  // src/api/ExtensionsAPI.js
  var ExtensionsAPI = class {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client) {
      this._client = client;
    }
    /**
     * @internal
     * @param {string} [extensionKey]
     * @returns {Record<string, string>}
     */
    _headers(extensionKey) {
      const key = extensionKey ?? this._client.getExtensionKey();
      if (!key) {
        throw new Error("\u62E1\u5F35\u30AD\u30FC\u304C\u5FC5\u8981\u3067\u3059\u3002\u30E1\u30BD\u30C3\u30C9\u306E\u5F15\u6570\u304B\u3001\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u306E extensionKey \u30AA\u30D7\u30B7\u30E7\u30F3\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      }
      return { "x-nyaitter-extension-key": key };
    }
    /**
     * 拡張キーに許可された戻り先へ、NyaitterAuth の認可リクエストを作成します。
     *
     * @param {object} params
     * @param {string} [params.extensionKey] - 拡張キー（クライアントに設定済みの場合は省略可）
     * @param {string} params.redirectUri - 戻り先 URL（拡張キーに許可されたオリジンであること）
     * @param {string} [params.state] - 認可リクエストに引き継ぐ任意の状態値
     * @param {(string|{scope: string, required?: boolean})[]} [params.scopes] - 要求スコープ
     * @returns {Promise<object>} サーバーの認可リクエスト応答（auth_url 等）
     */
    initiate({ extensionKey, redirectUri, state, scopes } = {}) {
      return this._client.request("POST", "/internal/extensions/nyaitter-auth/initiate", {
        headers: this._headers(extensionKey),
        body: { redirect_uri: redirectUri, state, scopes }
      });
    }
    /**
     * 認可コードをアクセストークンへ交換します（拡張キー側のアプリとして）。
     *
     * @param {object} params
     * @param {string} [params.extensionKey] - 拡張キー（クライアントに設定済みの場合は省略可）
     * @param {string} params.code - 認可コード
     * @returns {Promise<object>} トークン交換の応答
     */
    exchangeToken({ extensionKey, code } = {}) {
      return this._client.request("POST", "/internal/extensions/nyaitter-auth/token", {
        headers: this._headers(extensionKey),
        body: { code }
      });
    }
    /**
     * アクセストークンのユーザー情報を取得します。
     * トークンはこの拡張キーに対して発行されたものである必要があります。
     *
     * @param {object} params
     * @param {string} [params.extensionKey] - 拡張キー（クライアントに設定済みの場合は省略可）
     * @param {string} params.accessToken - NyaitterAuth アクセストークン
     * @returns {Promise<{success: boolean, app_id: string, granted_scopes: string[], user: object}>}
     */
    getUserInfo({ extensionKey, accessToken } = {}) {
      return this._client.request("POST", "/internal/extensions/nyaitter-auth/userinfo", {
        headers: { ...this._headers(extensionKey), Authorization: `Bearer ${accessToken}` },
        body: {}
      });
    }
  };

  // src/RealtimeClient.js
  var CALL_EVENTS = {
    "call:joined": "callJoined",
    "call:watching": "callWatching",
    "call:roster": "callRoster",
    "call:signal": "callSignal",
    "call:state": "callState",
    "call:moderated": "callModerated",
    "call:kicked": "callKicked",
    "call:screen": "callScreen",
    "call:ended": "callEnded",
    "call:stage": "callStage",
    "call:error": "callError",
    "call:chat": "callChat",
    "call:chat-delete": "callChatDelete",
    "call:chat-clear": "callChatClear",
    "call:transcript": "callTranscript"
  };
  var SPACE_EVENTS = {
    space_message: "spaceMessage",
    space_message_deleted: "spaceMessageDeleted",
    space_deleted: "spaceDeleted",
    space_member_left: "spaceMemberLeft",
    space_signal: "spaceSignal",
    space_voice_roster: "spaceVoiceRoster"
  };
  function normalizeSpaceEvent(data) {
    const base = { spaceId: data.space_id };
    switch (data.type) {
      case "space_message":
        return { ...base, channelId: data.channel_id, message: data.message, user: data.user ?? null };
      case "space_message_deleted":
        return { ...base, channelId: data.channel_id, messageId: data.message_id };
      case "space_member_left":
        return { ...base, userId: data.user_id };
      case "space_signal":
        return { ...base, channelId: data.channel_id, fromUserId: data.from_user_id, data: data.data };
      case "space_voice_roster":
        return {
          ...base,
          channelId: data.channel_id,
          roster: data.roster,
          joinedUserId: data.joined_user_id ?? null,
          leftUserId: data.left_user_id ?? null
        };
      default:
        return base;
    }
  }
  var RealtimeClient = class {
    /**
     * @param {import('./NyaitterClient.js').NyaitterClient} client
     */
    constructor(client) {
      this._client = client;
      this._ws = null;
      this._listeners = /* @__PURE__ */ new Map();
      this._pingInterval = null;
      this._reconnectTimer = null;
      this._shouldReconnect = false;
      this._callRoom = null;
      this._spaceSubscriptions = /* @__PURE__ */ new Set();
    }
    /**
     * イベントリスナーを登録します。
     *
     * イベント一覧：
     * - `'notification'`  — 新着通知 `(notification: object) => void`
     * - `'notificationUnreadCount'` — 通知未読数の更新 `(count: number) => void`
     * - `'dm'`            — DM 新着メッセージ `({ dmId, message, sender }) => void`
     * - `'dmEdited'`      — DM メッセージの編集 `({ dmId, message }) => void`
     * - `'dmUnreadCount'` — DM 未読数の更新 `(count: number) => void`
     * - `'timelinePost'`  — フォロー中タイムラインの新着 `({ postId, authorId }) => void`
     * - `'call'`          — 通話系イベント全般（サーバーの `call:*` 生ペイロード） `(payload: object) => void`
     * - `'callJoined'`    — 通話に参加した `({ room, role, roster, owner_id, request_id }) => void`
     * - `'callWatching'`  — 予約ステージの待機に入った `({ room }) => void`
     * - `'callRoster'`    — 参加者一覧の更新 `({ room, roster }) => void`
     * - `'callSignal'`    — WebRTC シグナル `({ room, from, data }) => void`
     * - `'callState'`     — 通話状態の変化 `(payload) => void`
     * - `'callModerated'` — ホストによる操作を受けた `({ room, action }) => void`
     * - `'callKicked'`    — ステージから追放された `({ room, message }) => void`
     * - `'callScreen'`    — 画面共有の開始・終了 `({ room, user_id, active, stream_id, label }) => void`
     * - `'callEnded'`     — 通話が終了・退出になった `({ room, message }) => void`
     * - `'callStage'`     — ステージ状態の更新 `({ room, status }) => void`
     * - `'callError'`     — 通話操作のエラー `({ request_id, message }) => void`
     * - `'callChat'`      — 通話チャット `({ room, user_id, name, text, at }) => void`
     * - `'callChatDelete'`— 通話チャットの削除 `({ room, id }) => void`
     * - `'callChatClear'` — 通話チャットの全消去 `({ room }) => void`
     * - `'callTranscript'`— 文字起こし `({ room, user_id, name, text, at }) => void`
     * - `'dmRead'`        — DM の既読通知 `({ dmId, readerId }) => void`
     * - `'pollUpdated'`   — 投票の更新 `({ pollId, postId, poll }) => void`
     * - `'space'`         — スペース系イベント全般（サーバーの `space_*` 生ペイロード） `(payload: object) => void`
     * - `'spaceMessage'`  — スペースの新着メッセージ `({ spaceId, channelId, message, user }) => void`
     * - `'spaceMessageDeleted'` — スペースのメッセージ削除 `({ spaceId, channelId, messageId }) => void`
     * - `'spaceDeleted'`  — スペースの削除 `({ spaceId }) => void`
     * - `'spaceMemberLeft'` — スペースからの退出 `({ spaceId, userId }) => void`
     * - `'spaceSignal'`   — スペースボイスの WebRTC シグナル `({ spaceId, channelId, fromUserId, data }) => void`
     * - `'spaceVoiceRoster'` — スペースボイスの参加者一覧 `({ spaceId, channelId, roster, joinedUserId, leftUserId }) => void`
     * - `'open'`          — 接続完了 `() => void`
     * - `'close'`         — 切断 `() => void`
     * - `'error'`         — エラー `(error: Event) => void`
     *
     * @param {string} event - イベント名
     * @param {Function} handler - コールバック関数
     * @returns {this} メソッドチェーン可
     *
     * @example
     * realtime.on('notification', (n) => console.log(n));
     */
    on(event, handler) {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, /* @__PURE__ */ new Set());
      }
      this._listeners.get(event).add(handler);
      return this;
    }
    /**
     * イベントリスナーを解除します。
     *
     * @param {string} event - イベント名
     * @param {Function} handler - 登録時と同じコールバック関数
     * @returns {this}
     */
    off(event, handler) {
      this._listeners.get(event)?.delete(handler);
      return this;
    }
    /** @internal */
    _emit(event, data) {
      for (const handler of this._listeners.get(event) ?? []) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[NyaitterRealtime] '${event}' \u30CF\u30F3\u30C9\u30E9\u30FC\u3067\u30A8\u30E9\u30FC:`, err);
        }
      }
    }
    /**
     * WebSocket に接続します。
     * 接続が確立すると `'open'` イベントが発火します。
     *
     * @param {object} [options]
     * @param {boolean} [options.autoReconnect=true] - 切断時に自動再接続するか
     * @param {number}  [options.reconnectDelayMs=3000] - 再接続までの待機時間
     * @returns {Promise<void>} 接続完了で resolve
     */
    connect({ autoReconnect = true, reconnectDelayMs = 3e3 } = {}) {
      this._shouldReconnect = autoReconnect;
      this._reconnectDelayMs = reconnectDelayMs;
      return this._connect();
    }
    /** @internal */
    _connect() {
      return new Promise((resolve, reject) => {
        const base = this._client._baseUrl.replace(/^http/, "ws");
        const token = this._client.getToken();
        const url = `${base}/realtime`;
        const WSClass = this._client._WebSocket || globalThis.WebSocket;
        if (!WSClass) {
          throw new Error("WebSocket \u5B9F\u88C5\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002globalThis.WebSocket \u307E\u305F\u306F client \u30AA\u30D7\u30B7\u30E7\u30F3\u306B WebSocket \u3092\u6E21\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
        }
        const isBrowserWebSocket = typeof globalThis.WebSocket === "function" && WSClass === globalThis.WebSocket;
        const wsOptions = token && !isBrowserWebSocket ? { headers: { Authorization: `Bearer ${token}` } } : void 0;
        const ws = wsOptions ? new WSClass(url, wsOptions) : new WSClass(url);
        this._ws = ws;
        const onOpen = () => {
          this._startPing();
          this._emit("open");
          resolve();
        };
        const onMessage = (event) => {
          const raw = typeof event === "string" ? event : event?.data ?? event;
          this._handleMessage(raw);
        };
        const onClose = () => {
          this._stopPing();
          this._emit("close");
          if (this._shouldReconnect) {
            this._reconnectTimer = setTimeout(() => this._connect(), this._reconnectDelayMs);
          }
        };
        const onError = (err) => {
          this._emit("error", err);
          reject(err);
        };
        if (typeof ws.addEventListener === "function") {
          ws.addEventListener("open", onOpen);
          ws.addEventListener("message", onMessage);
          ws.addEventListener("close", onClose);
          ws.addEventListener("error", onError);
        } else if (typeof ws.on === "function") {
          ws.on("open", onOpen);
          ws.on("message", (data) => onMessage({ data: data.toString() }));
          ws.on("close", onClose);
          ws.on("error", onError);
        }
      });
    }
    /** @internal */
    _handleMessage(raw) {
      let data;
      try {
        data = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString());
      } catch {
        return;
      }
      this._emit("raw", data);
      if (typeof data?.type === "string" && data.type.startsWith("call:")) {
        const event = CALL_EVENTS[data.type];
        if (event) this._emit(event, data);
        this._emit("call", data);
        return;
      }
      if (typeof data?.type === "string" && data.type.startsWith("space_")) {
        const event = SPACE_EVENTS[data.type];
        if (event) this._emit(event, normalizeSpaceEvent(data));
        this._emit("space", data);
        return;
      }
      switch (data.type) {
        case "notification_new":
          this._emit("notification", data.notification);
          this._emit("notificationUnreadCount", data.unread_count);
          break;
        case "notification_unread_count":
          this._emit("notificationUnreadCount", data.unread_count);
          break;
        case "dm_message":
          this._emit("dm", {
            dmId: data.dm_id,
            message: data.message,
            sender: data.sender ?? null
          });
          break;
        case "dm_message_edited":
          this._emit("dmEdited", { dmId: data.dm_id, message: data.message });
          break;
        case "dm_unread_count":
          this._emit("dmUnreadCount", data.unread_count);
          break;
        case "dm_read":
          this._emit("dmRead", { dmId: data.dm_id, readerId: data.reader_id });
          break;
        case "poll_updated":
          this._emit("pollUpdated", { pollId: data.poll_id, postId: data.post_id, poll: data.poll });
          break;
        case "timeline_post":
          this._emit("timelinePost", {
            postId: data.post_id,
            authorId: data.author_id
          });
          break;
        // pong はライブラリが内部で処理するだけ
        case "pong":
          break;
      }
    }
    /** @internal */
    _startPing() {
      this._pingInterval = setInterval(() => {
        if (this._ws?.readyState === 1) {
          this._ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25e3);
    }
    /** @internal */
    _stopPing() {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
    /**
     * WebSocket を切断します。
     * 自動再接続も停止します。
     */
    disconnect() {
      this._shouldReconnect = false;
      clearTimeout(this._reconnectTimer);
      this._stopPing();
      this._ws?.close();
      this._ws = null;
    }
    /**
     * 現在接続中かどうかを返します。
     * @returns {boolean}
     */
    get connected() {
      return this._ws?.readyState === 1;
    }
    /**
     * 現在参加中の通話ルームを返します。未参加のときは `null` です。
     * @returns {{ kind: string, id: string|number }|null}
     */
    get callRoom() {
      return this._callRoom;
    }
    /**
     * WebSocket へ生の JSON メッセージを送信します。
     * 通話プロトコル（`call:*`）もこれで送信できます。
     *
     * @param {object} message - `type` を含むメッセージ
     * @throws {Error} 未接続のとき
     *
     * @example
     * realtime.send({ type: 'call:leave' });
     */
    send(message) {
      if (!this.connected) throw new Error("WebSocket \u304C\u63A5\u7D9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002");
      this._ws.send(JSON.stringify(message));
    }
    /**
     * @internal
     * @param {{kind?: string|number, id?: string|number}} [options]
     */
    _resolveCallRoom({ kind, id } = {}) {
      const resolvedKind = kind ?? this._callRoom?.kind;
      const resolvedId = id ?? this._callRoom?.id;
      if (!resolvedKind || resolvedId === void 0 || resolvedId === null) {
        throw new Error("\u901A\u8A71\u30EB\u30FC\u30E0\u304C\u6307\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u5148\u306B joinCall() \u306A\u3069\u3092\u547C\u3073\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      }
      return { kind: resolvedKind, id: resolvedId };
    }
    /**
     * 通話（ステージまたは DM）に参加します。
     * 以後の操作はこのルームが既定の対象になります。
     *
     * @param {object} params
     * @param {'stage'|'dm'} params.kind - 通話の種類
     * @param {string|number} params.id - ステージ ID または DM グループ ID
     * @param {string} [params.requestId] - 応答を対応付ける任意の ID
     * @param {boolean} [params.muted] - 初期ミュート状態
     * @param {boolean} [params.camera] - 初期カメラ状態
     *
     * @example
     * realtime.joinCall({ kind: 'dm', id: 'dm_group_id' });
     */
    joinCall({ kind, id, requestId, muted, camera } = {}) {
      if (!kind || id === void 0 || id === null) throw new Error("kind \u3068 id \u306F\u5FC5\u9808\u3067\u3059\u3002");
      this._callRoom = { kind, id };
      this.send({ type: "call:join", kind, id, request_id: requestId, muted, camera });
    }
    /**
     * 予約済み（開始前）のステージを待機入りします。
     * ステージが `live` になると自動的に参加扱いになります。
     *
     * @param {string} id - ステージ ID
     * @param {object} [options]
     * @param {string} [options.requestId] - 応答を対応付ける任意の ID
     */
    watchStage(id, { requestId } = {}) {
      this._callRoom = { kind: "stage", id };
      this.send({ type: "call:watch", kind: "stage", id, request_id: requestId });
    }
    /**
     * 通話から退出します。
     */
    leaveCall() {
      this._callRoom = null;
      this.send({ type: "call:leave" });
    }
    /**
     * 特定の参加者へ WebRTC シグナル（SDP / ICE）を送信します。
     *
     * @param {object} params
     * @param {string|number} params.to - 送信先のユーザー ID
     * @param {object} params.data - `{ description }` または `{ candidate }`
     * @param {string|number} [params.kind] - 対象ルームの種類（既定は参加中のルーム）
     * @param {string|number} [params.id] - 対象ルームの ID（既定は参加中のルーム）
     */
    sendCallSignal({ to, data, kind, id } = {}) {
      const room = this._resolveCallRoom({ kind, id });
      this.send({ type: "call:signal", ...room, to, data });
    }
    /**
     * 自分のマイク・カメラ・文字起こしの状態を通知します。
     *
     * @param {object} [params]
     * @param {boolean} [params.muted]
     * @param {boolean} [params.camera]
     * @param {boolean} [params.transcriptionEnabled]
     * @param {boolean} [params.transcription_enabled]
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    setCallState({ muted, camera, transcriptionEnabled, transcription_enabled, kind, id } = {}) {
      const room = this._resolveCallRoom({ kind, id });
      this.send({
        type: "call:state",
        ...room,
        muted,
        camera,
        transcription_enabled: transcriptionEnabled ?? transcription_enabled
      });
    }
    /**
     * ステージのホストとして参加者を操作します。
     *
     * @param {object} params
     * @param {string|number} params.target - 対象ユーザー ID
     * @param {'mute'|'camera'|'chat'|'kick'|'pin'|'promote'|'demote'} params.action - 操作
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    moderateCall({ target, action, kind, id } = {}) {
      const room = this._resolveCallRoom({ kind, id });
      this.send({ type: "call:moderate", ...room, target, action });
    }
    /**
     * 画面共有の開始・終了を通知します。
     *
     * @param {object} params
     * @param {boolean} params.active - 共有中かどうか
     * @param {string} [params.streamId] - 共有ストリーム ID（開始時は必須）
     * @param {string} [params.stream_id]
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    setCallScreen({ active, streamId, stream_id, kind, id } = {}) {
      const room = this._resolveCallRoom({ kind, id });
      this.send({ type: "call:screen", ...room, active, stream_id: streamId ?? stream_id });
    }
    /**
     * 通話チャットを送信します。
     *
     * @param {object} params
     * @param {string} params.text - 本文（最大2000文字）
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    sendCallChat({ text, kind, id } = {}) {
      const room = this._resolveCallRoom({ kind, id });
      this.send({ type: "call:chat", ...room, text });
    }
    /**
     * 通話チャットのメッセージを削除します（自分のメッセージ、またはホストは全員のメッセージ）。
     *
     * @param {object} params
     * @param {string} params.messageId - 削除するチャットメッセージ ID
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    deleteCallChatMessage({ messageId, kind, id } = {}) {
      const room = this._resolveCallRoom({ kind, id });
      this.send({ type: "call:chat-delete", ...room, message_id: messageId });
    }
    /**
     * 通話チャットを全消去します（ホストのみ）。
     *
     * @param {object} [params]
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    clearCallChat({ kind, id } = {}) {
      const room = this._resolveCallRoom({ kind, id });
      this.send({ type: "call:chat-clear", ...room });
    }
    /**
     * 文字起こしを送信します（スピーカー・ミュート解除中のみ）。
     *
     * @param {object} params
     * @param {string} params.text - 本文（最大2000文字）
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    sendCallTranscript({ text, kind, id } = {}) {
      const room = this._resolveCallRoom({ kind, id });
      this.send({ type: "call:transcript", ...room, text });
    }
    /**
     * 現在購読中のスペース ID 一覧を返します。
     * @returns {string[]}
     */
    get spaceSubscriptions() {
      return [...this._spaceSubscriptions];
    }
    /**
     * スペースのテキストメッセージをリアルタイム受信できるよう購読します。
     * サーバーは接続ユーザーがスペースのメンバーであることを毎回確認します。
     *
     * @param {string|number} spaceId - スペース ID
     */
    subscribeSpace(spaceId) {
      const id = String(spaceId);
      this._spaceSubscriptions.add(id);
      this.send({ type: "space:subscribe", spaceId: id });
    }
    /**
     * スペースの購読を解除します。
     *
     * @param {string|number} spaceId - スペース ID
     */
    unsubscribeSpace(spaceId) {
      const id = String(spaceId);
      this._spaceSubscriptions.delete(id);
      this.send({ type: "space:unsubscribe", spaceId: id });
    }
    /**
     * スペースのボイスチャンネルに参加します。
     * 参加者一覧は `'spaceVoiceRoster'` イベントで届きます。
     *
     * @param {object} params
     * @param {string|number} params.spaceId - スペース ID
     * @param {string|number} params.channelId - ボイスチャンネル ID
     * @param {boolean} [params.muted] - 初期ミュート状態
     * @param {boolean} [params.deafened] - 初期スピーカーオフ状態
     */
    joinSpaceVoice({ spaceId, channelId, muted, deafened } = {}) {
      this.send({
        type: "space:join_voice",
        spaceId: String(spaceId),
        channelId: String(channelId),
        muted: Boolean(muted),
        deafened: Boolean(deafened)
      });
    }
    /**
     * スペースのボイスチャンネルから退出します。
     *
     * @param {object} params
     * @param {string|number} params.spaceId - スペース ID
     * @param {string|number} params.channelId - ボイスチャンネル ID
     */
    leaveSpaceVoice({ spaceId, channelId } = {}) {
      this.send({ type: "space:leave_voice", spaceId: String(spaceId), channelId: String(channelId) });
    }
    /**
     * スペースボイスでの自分のミュート・スピーカー状態を通知します。
     * 指定しなかった項目はサーバー側で変更されません。
     *
     * @param {object} params
     * @param {string|number} params.spaceId - スペース ID
     * @param {string|number} params.channelId - ボイスチャンネル ID
     * @param {boolean} [params.muted]
     * @param {boolean} [params.deafened]
     */
    setSpaceVoiceState({ spaceId, channelId, muted, deafened } = {}) {
      this.send({
        type: "space:voice_state",
        spaceId: String(spaceId),
        channelId: String(channelId),
        ...muted === void 0 ? {} : { muted: Boolean(muted) },
        ...deafened === void 0 ? {} : { deafened: Boolean(deafened) }
      });
    }
    /**
     * 同じボイスチャンネルにいる特定の参加者へ WebRTC シグナル（SDP / ICE）を送信します。
     * 相手には `'spaceSignal'` イベントで届きます。
     *
     * @param {object} params
     * @param {string|number} params.spaceId - スペース ID
     * @param {string|number} params.channelId - ボイスチャンネル ID
     * @param {string|number} params.toUserId - 送信先のユーザー ID
     * @param {object} params.data - `{ description }` または `{ candidate }`
     */
    sendSpaceSignal({ spaceId, channelId, toUserId, data } = {}) {
      this.send({
        type: "space:signal",
        spaceId: String(spaceId),
        channelId: String(channelId),
        toUserId: Number(toUserId),
        data
      });
    }
  };

  // src/NyaitterClient.js
  var NyaitterClient = class {
    /**
     * @param {object} options
     * @param {string} options.baseUrl - Nyaitter サーバーの URL
     * @param {string} [options.token] - Bot トークンまたはアクセストークン
     * @param {string} [options.extensionKey] - 拡張 API キー（`client.extensions` 用）
     * @param {typeof fetch} [options.fetch] - カスタム fetch 関数
     * @param {any} [options.WebSocket] - カスタム WebSocket クラス
     */
    constructor({ baseUrl, token = null, extensionKey = null, fetch: customFetch = null, WebSocket: customWebSocket = null } = {}) {
      if (!baseUrl) throw new Error("baseUrl \u306F\u5FC5\u9808\u3067\u3059");
      this._baseUrl = baseUrl.replace(/\/+$/, "");
      this._token = token;
      this._extensionKey = extensionKey;
      this._fetch = customFetch || (globalThis.fetch ? globalThis.fetch.bind(globalThis) : null);
      this._WebSocket = customWebSocket || globalThis.WebSocket;
      if (typeof this._fetch !== "function") {
        throw new Error("fetch \u95A2\u6570\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002Node.js 18+ \u307E\u305F\u306F fetch \u30DD\u30EA\u30D5\u30A3\u30EB\u304C\u5FC5\u8981\u3067\u3059\u3002");
      }
      this.auth = new AuthAPI(this);
      this.posts = new PostsAPI(this);
      this.notes = new NotesAPI(this);
      this.polls = new PollsAPI(this);
      this.users = new UsersAPI(this);
      this.dm = new DmAPI(this);
      this.calls = new CallsAPI(this);
      this.spaces = new SpacesAPI(this);
      this.notifications = new NotificationsAPI(this);
      this.groups = new GroupsAPI(this);
      this.uploads = new UploadsAPI(this);
      this.ranking = new RankingAPI(this);
      this.reports = new ReportsAPI(this);
      this.appeals = new AppealsAPI(this);
      this.verification = new VerificationAPI(this);
      this.imposters = new ImpostersAPI(this);
      this.push = new PushAPI(this);
      this.rules = new RulesAPI(this);
      this.urlCards = new UrlCardsAPI(this);
      this.oembed = new OEmbedAPI(this);
      this.ui = new UIAPI(this);
      this.system = new SystemAPI(this);
      this.nyaitterAuth = new NyaitterAuthAPI(this);
      this.extensions = new ExtensionsAPI(this);
    }
    /**
     * アクセストークンを設定します。
     * @param {string|null} token
     */
    setToken(token) {
      this._token = token;
    }
    /**
     * 現在のアクセストークンを取得します。
     * @returns {string|null}
     */
    getToken() {
      return this._token;
    }
    /**
     * 拡張 API キーを設定します（`client.extensions` の既定キー）。
     * @param {string|null} extensionKey
     */
    setExtensionKey(extensionKey) {
      this._extensionKey = extensionKey;
    }
    /**
     * 現在の拡張 API キーを取得します。
     * @returns {string|null}
     */
    getExtensionKey() {
      return this._extensionKey;
    }
    /**
     * 認証中のユーザーの情報を取得します。
     * `client.users.getMe()` のエイリアスです。
     *
     * @returns {Promise<{ user: object, isBot: boolean, tokenType: string }>}
     */
    getMe() {
      return this.users.getMe();
    }
    /**
     * ユーザーオブジェクトまたはユーザー ID から、適切なアカウントアイコン URL を返します。
     *
     * @param {object|number|string} user - ユーザーオブジェクトまたはユーザー ID
     * @returns {string} アイコンの URL
     */
    getUserIconUrl(user) {
      return this.users.getIconUrl(user);
    }
    /**
     * グループオブジェクトまたはアイコン文字列から、適切なグループアイコン URL を返します。
     *
     * @param {object|string} group - グループオブジェクトまたはアイコン文字列
     * @returns {string} グループアイコンの URL
     */
    getGroupIconUrl(group) {
      return this.groups.getIconUrl(group);
    }
    /**
     * リアルタイムイベントを受信するためのクライアントを作成します。
     *
     * @param {object} [options]
     * @param {boolean} [options.autoReconnect=true] - 切断時の自動再接続
     * @param {number} [options.reconnectDelayMs=3000] - 再接続待機時間
     * @returns {RealtimeClient}
     */
    realtime(options = {}) {
      return new RealtimeClient(this, options);
    }
    /**
     * API リクエストを送信する内部メソッド。
     *
     * @param {string} method - HTTP メソッド
     * @param {string} path - エンドポイントのパス
     * @param {object} [options]
     * @param {any} [options.body] - 送信する JSON ボディ
     * @param {object} [options.query] - URL クエリパラメータ
     * @param {Record<string, string>} [options.headers] - 追加ヘッダー
     * @returns {Promise<any>}
     */
    async request(method, path, { body, query, headers = {} } = {}) {
      const response = await this.requestResponse(method, path, { body, query, headers });
      const data = await this._parseResponse(response);
      if (!response.ok) {
        const message = typeof data === "object" && (data?.error || data?.message) || `HTTP ${response.status} ${response.statusText || ""}`.trim();
        throw new NyaitterError(message, response.status, data);
      }
      return data;
    }
    /**
     * API リクエストをレスポンス情報付きで送信します。
     * @param {string} methodOrPath HTTP メソッド、または直接指定するエンドポイント
     * @param {string|object} [pathOrOptions] エンドポイント、または GET 用オプション
     * @param {object} [requestOptions]
     * @example
     * await client.requestResponse('/api/custom-endpoint');
     * @returns {Promise<Response>}
     */
    async requestResponse(methodOrPath, pathOrOptions = {}, requestOptions = {}) {
      const directEndpoint = typeof pathOrOptions === "object" && pathOrOptions !== null;
      const method = directEndpoint ? pathOrOptions.method || "GET" : methodOrPath;
      const path = directEndpoint ? methodOrPath : pathOrOptions;
      const { body, query, headers = {}, signal, cache } = directEndpoint ? pathOrOptions : requestOptions;
      const rawPath = path.startsWith("/") ? path : `/${path}`;
      let url;
      if (/^https?:\/\//i.test(path)) {
        url = new URL(path);
      } else {
        const base = new URL(this._baseUrl);
        const basePath = base.pathname.replace(/\/+$/, "");
        const requestPath = basePath && (rawPath === basePath || rawPath.startsWith(`${basePath}/`)) ? rawPath.slice(basePath.length) || "/" : rawPath;
        url = new URL(`${base.origin}${basePath}${requestPath}`);
      }
      if (query && typeof query === "object") {
        for (const [key, value] of Object.entries(query)) {
          if (value !== void 0 && value !== null) {
            if (Array.isArray(value)) {
              url.searchParams.set(key, value.join(","));
            } else {
              url.searchParams.set(key, String(value));
            }
          }
        }
      }
      const isBinary = typeof Blob !== "undefined" && body instanceof Blob || typeof ArrayBuffer !== "undefined" && (body instanceof ArrayBuffer || ArrayBuffer.isView(body));
      const reqHeaders = {
        ...headers
      };
      if (body !== void 0 && !isBinary && !reqHeaders["Content-Type"] && !reqHeaders["content-type"]) {
        reqHeaders["Content-Type"] = "application/json";
      }
      if (this._token && !reqHeaders["Authorization"] && !reqHeaders["authorization"]) {
        reqHeaders["Authorization"] = `Bearer ${this._token}`;
      }
      const fetchOptions = {
        method,
        headers: reqHeaders,
        credentials: "include",
        signal,
        cache
      };
      if (body !== void 0) {
        fetchOptions.body = typeof body === "string" || isBinary ? body : JSON.stringify(body);
      }
      return this._fetch(url.toString(), fetchOptions);
    }
    async _parseResponse(response) {
      let data;
      const contentType = response.headers?.get?.("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      return data;
    }
    /** @internal */
    _get(path, query) {
      return this.request("GET", path, { query });
    }
    /** @internal */
    _post(path, body, query) {
      return this.request("POST", path, { body, query });
    }
    /** @internal */
    _put(path, body, query) {
      return this.request("PUT", path, { body, query });
    }
    /** @internal */
    _patch(path, body, query) {
      return this.request("PATCH", path, { body, query });
    }
    /** @internal */
    _delete(path, body, query) {
      return this.request("DELETE", path, { body, query });
    }
  };
  var NyaitterError = class extends Error {
    /**
     * @param {string} message - エラーメッセージ
     * @param {number} status - HTTP ステータスコード
     * @param {any} data - サーバーからのレスポンスデータ
     */
    constructor(message, status, data) {
      super(message);
      this.name = "NyaitterError";
      this.status = status;
      this.data = data;
    }
  };
  return __toCommonJS(index_exports);
})();

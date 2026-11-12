/**
 * グループオブジェクトまたはアイコンデータから、適切なグループアイコン URL を生成して返します。
 *
 * @param {object|string} group - グループオブジェクトまたはアイコン文字列
 * @param {object} [options]
 * @param {string} [options.baseUrl] - サーバーのベース URL
 * @returns {string} グループアイコンの URL
 *
 * @example
 * const url = getGroupIconUrl(group, { baseUrl: 'https://nyaitter.example.com' });
 */
export function getGroupIconUrl(group: object | string, { baseUrl }?: {
    baseUrl?: string;
}): string;
export class GroupsAPI {
    /** @param {import('../NyaitterClient.cjs').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.cjs").NyaitterClient);
    _client: import("../NyaitterClient.cjs").NyaitterClient;
    /**
     * グループオブジェクトまたはアイコン文字列から、適切なグループアイコン URL を返します。
     *
     * @param {object|string} group - グループオブジェクトまたはアイコン文字列
     * @returns {string} グループアイコンの URL
     *
     * @example
     * const iconUrl = client.groups.getIconUrl(group);
     */
    getIconUrl(group: object | string): string;
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
    list({ query, limit, offset }?: {
        query?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        groups: object[];
    }>;
    /**
     * 自分が所属しているグループ一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.postAsUserId] - 互換用（Serverは無視し、認証中ユーザーの一覧を返します）
     * @param {number} [params.limit=50] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ groups: object[], limit: number, offset: number }>}
     */
    listMine({ postAsUserId, limit, offset }?: {
        postAsUserId?: number;
        limit?: number;
        offset?: number;
    }): Promise<{
        groups: object[];
        limit: number;
        offset: number;
    }>;
    /**
     * 自分に届いているグループ招待一覧を取得します。
     *
     * @returns {Promise<{ invites: Array<{ id: string, group_id: string, inviter_id: number, invitee_id: number, status: string, group: object|null }> }>}
     */
    getInvitesMine(): Promise<{
        invites: Array<{
            id: string;
            group_id: string;
            inviter_id: number;
            invitee_id: number;
            status: string;
            group: object | null;
        }>;
    }>;
    /**
     * グループ招待に応答します。
     *
     * @param {string} inviteId - 招待 ID
     * @param {'accept'|'decline'} decision - 応答判定
     * @returns {Promise<{ success: boolean, group?: object }>}
     */
    respondInvite(inviteId: string, decision: "accept" | "decline"): Promise<{
        success: boolean;
        group?: object;
    }>;
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
    get(groupId: string, { postAsUserId }?: {
        postAsUserId?: number;
    }): Promise<{
        group: object;
    }>;
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
    create({ name, description, visibility, iconData, headerImage, category }?: {
        name: string;
        description?: string;
        visibility?: "open" | "open_invite" | "approval" | "closed";
        iconData?: string;
        headerImage?: string;
        category?: string;
    }): Promise<{
        group: object;
    }>;
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
    update(groupId: string, { name, description, visibility, iconData, headerImage }?: {
        name?: string;
        description?: string;
        visibility?: "open" | "open_invite" | "approval" | "closed";
        iconData?: string;
        headerImage?: string;
    }): Promise<{
        group: object;
    }>;
    /**
     * グループのオーナー権限を別のメンバーに譲渡します。
     *
     * @param {string} groupId - グループ ID
     * @param {number} userId - 新オーナーのユーザー ID
     * @returns {Promise<{ group: object }>}
     */
    transferOwner(groupId: string, userId: number): Promise<{
        group: object;
    }>;
    /**
     * グループを削除します。
     *
     * @param {string} groupId - グループ ID
     * @returns {Promise<{ success: boolean }>}
     */
    delete(groupId: string): Promise<{
        success: boolean;
    }>;
    /**
     * グループに参加します。
     *
     * @param {string} groupId - グループ ID
     * @returns {Promise<{ membership: object, joined: true } | { join_request: object, pending: true }>}
     */
    join(groupId: string): Promise<{
        membership: object;
        joined: true;
    } | {
        join_request: object;
        pending: true;
    }>;
    /**
     * グループから退出します。
     *
     * @param {string} groupId - グループ ID
     * @returns {Promise<{ success: boolean }>}
     */
    leave(groupId: string): Promise<{
        success: boolean;
    }>;
    /**
     * ユーザーをグループに招待します。
     *
     * @param {string} groupId - グループ ID
     * @param {number} userId - 招待するユーザー ID
     * @returns {Promise<{ success: boolean, invite: object }>}
     */
    invite(groupId: string, userId: number): Promise<{
        success: boolean;
        invite: object;
    }>;
    /**
     * 保留中の参加申請一覧を取得します。
     *
     * @param {string} groupId - グループ ID
     * @param {{status?: string}} [params]
     * @returns {Promise<{ requests: object[] }>}
     */
    getJoinRequests(groupId: string, { status }?: {
        status?: string;
    }): Promise<{
        requests: object[];
    }>;
    /**
     * 参加申請に応答します。
     *
     * @param {string} groupId - グループ ID
     * @param {string} requestId - 参加申請 ID
     * @param {'approve'|'decline'} decision - 判定
     * @returns {Promise<{ join_request: object }>}
     */
    respondJoinRequest(groupId: string, requestId: string, decision: "approve" | "decline"): Promise<{
        join_request: object;
    }>;
    /**
     * グループのロール一覧を取得します。
     *
     * @param {string} groupId - グループ ID
     * @returns {Promise<{ roles: object[] }>}
     */
    getRoles(groupId: string): Promise<{
        roles: object[];
    }>;
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
    createRole(groupId: string, { name, permissions, sortOrder }?: {
        name: string;
        permissions: string[];
        sortOrder?: number;
    }): Promise<{
        role: object;
    }>;
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
    updateRole(groupId: string, roleId: string, { name, permissions, sortOrder }?: {
        name?: string;
        permissions?: string[];
        sortOrder?: number;
    }): Promise<{
        role: object;
    }>;
    /**
     * カスタムロールを削除します。
     *
     * @param {string} groupId - グループ ID
     * @param {string} roleId - ロール ID
     * @returns {Promise<{ success: boolean }>}
     */
    deleteRole(groupId: string, roleId: string): Promise<{
        success: boolean;
    }>;
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
    getMembers(groupId: string, { status, limit, offset }?: {
        status?: "active" | "pending" | "invited" | "banned";
        limit?: number;
        offset?: number;
    }): Promise<{
        members: object[];
    }>;
    /**
     * メンバーのロールを変更します。
     *
     * @param {string} groupId - グループ ID
     * @param {number} userId - 対象ユーザー ID
     * @param {string} roleId - 付与するロール ID
     * @returns {Promise<{ member: object }>}
     */
    updateMember(groupId: string, userId: number, roleId: string): Promise<{
        member: object;
    }>;
    /**
     * メンバーをグループから BAN します。
     *
     * @param {string} groupId - グループ ID
     * @param {number} userId - BAN するユーザー ID
     * @returns {Promise<{ success: boolean }>}
     */
    banMember(groupId: string, userId: number): Promise<{
        success: boolean;
    }>;
    /**
     * メンバーの BAN を解除します。
     *
     * @param {string} groupId - グループ ID
     * @param {number} userId - BAN 解除するユーザー ID
     * @returns {Promise<{ success: boolean }>}
     */
    unbanMember(groupId: string, userId: number): Promise<{
        success: boolean;
    }>;
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
    getPosts(groupId: string, { limit, offset, beforeId, cursor, authorId, subType, order, mode }?: {
        limit?: number;
        offset?: number;
        beforeId?: number;
        cursor?: string;
        authorId?: number;
        subType?: string;
        order?: string;
        mode?: string;
    }): Promise<{
        posts: object[];
        has_next: boolean;
        next_cursor: any;
    }>;
}

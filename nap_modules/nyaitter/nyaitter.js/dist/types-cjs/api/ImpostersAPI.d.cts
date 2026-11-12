/**
 * インポスターAPI
 * インポスターの作成・一覧取得・共同運用メンバーの追加/変更/削除・インポスターの削除を行います。
 */
export class ImpostersAPI {
    /** @param {import('../NyaitterClient.cjs').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.cjs").NyaitterClient);
    _client: import("../NyaitterClient.cjs").NyaitterClient;
    /**
     * 自分がアクセス可能なインポスター一覧を取得します。
     *
     * @returns {Promise<{ imposters: object[], limit: number }>}
     *
     * @example
     * const { imposters } = await client.imposters.list();
     */
    list(): Promise<{
        imposters: object[];
        limit: number;
    }>;
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
    create({ name }?: {
        name: string;
    }): Promise<{
        imposter: object;
    }>;
    /**
     * インポスターに共同運用者を追加します。
     *
     * @param {number} imposterId - インポスターのユーザー ID
     * @param {object} params
     * @param {number} params.userId - 追加するユーザー ID
     * @param {'operator'|'manager'} [params.role='operator'] - 権限ロール
     * @returns {Promise<{ imposter: object }>}
     */
    addMember(imposterId: number, { userId, role }?: {
        userId: number;
        role?: "operator" | "manager";
    }): Promise<{
        imposter: object;
    }>;
    /**
     * インポスターの共同運用者の権限ロールを変更します。
     *
     * @param {number} imposterId - インポスターのユーザー ID
     * @param {number} memberId - 運用者のユーザー ID
     * @param {object} params
     * @param {'operator'|'manager'} params.role - 新しい権限ロール
     * @returns {Promise<{ imposter: object }>}
     */
    updateMemberRole(imposterId: number, memberId: number, { role }?: {
        role: "operator" | "manager";
    }): Promise<{
        imposter: object;
    }>;
    /**
     * インポスターから共同運用者を削除します。
     *
     * @param {number} imposterId - インポスターのユーザー ID
     * @param {number} memberId - 削除する運用者のユーザー ID
     * @returns {Promise<{ imposter: object }>}
     */
    removeMember(imposterId: number, memberId: number): Promise<{
        imposter: object;
    }>;
    /**
     * インポスターを削除します。
     *
     * @param {number} imposterId - 削除するインポスターのユーザー ID
     * @returns {Promise<{ success: boolean }>}
     */
    delete(imposterId: number): Promise<{
        success: boolean;
    }>;
}

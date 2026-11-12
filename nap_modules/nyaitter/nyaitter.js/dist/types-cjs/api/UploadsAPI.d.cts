/**
 * アップロード / メディア API
 * 画像や添付ファイルのアップロード・ストレージ使用量確認・ファイル削除などを行います。
 */
export class UploadsAPI {
    /** @param {import('../NyaitterClient.cjs').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.cjs").NyaitterClient);
    _client: import("../NyaitterClient.cjs").NyaitterClient;
    /**
     * 直接アップロード先を発行します。
     * @param {object} params
     * @param {string} params.fileName
     * @param {string} [params.contentType]
     * @param {number} [params.asUserId]
     * @param {string} [params.replaceId]
     * @returns {Promise<{id: string, url: string|null, key: string, replaced?: boolean}>}
     */
    prepare({ fileName, contentType, asUserId, replaceId }?: {
        fileName: string;
        contentType?: string;
        asUserId?: number;
        replaceId?: string;
    }): Promise<{
        id: string;
        url: string | null;
        key: string;
        replaced?: boolean;
    }>;
    uploadPartResponse(uploadId: any, file: any, { contentType, asUserId }?: {
        contentType?: string;
        asUserId?: any;
    }): Promise<Response>;
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
    upload({ file, fileName, contentType, asUserId }?: {
        file: string | Uint8Array | ArrayBuffer | Blob;
        fileName: string;
        contentType?: string;
        asUserId?: number;
    }): Promise<{
        id: string;
        url: string;
        contentType: string;
        size: number;
    }>;
    /**
     * 自分のストレージ使用状況とファイル一覧を取得します。
     *
     * @returns {Promise<{ limit_mb: number, limit_bytes: number, used_bytes: number, used_percent: number, files: Array<{ id: string, url: string, size: number, lastModified: string }> }>}
     */
    getStorage(): Promise<{
        limit_mb: number;
        limit_bytes: number;
        used_bytes: number;
        used_percent: number;
        files: Array<{
            id: string;
            url: string;
            size: number;
            lastModified: string;
        }>;
    }>;
    /**
     * アップロード済みファイルを削除します。
     *
     * @param {object|string[]} params - 削除するファイル ID リストまたはオプション
     * @param {string[]} [params.fileIds] - ファイル ID 配列
     * @param {number} [params.asUserId] - インポスター代理削除時のユーザー ID
     * @returns {Promise<{ success: boolean, deleted_count: number }>}
     */
    delete(params: object | string[]): Promise<{
        success: boolean;
        deleted_count: number;
    }>;
    /**
     * 添付画像ファイルのサムネイルURL を取得します。
     *
     * @param {string} fileId - ファイル ID
     * @returns {string} プレビュー URL
     */
    getPreviewUrl(fileId: string): string;
}

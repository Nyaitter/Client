/** スペースとチャンネルを操作します。 */
export class SpacesAPI {
    /** @param {import('../NyaitterClient.cjs').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.cjs").NyaitterClient);
    _client: import("../NyaitterClient.cjs").NyaitterClient;
    /** 音声通話用の接続設定を取得します。 */
    getIceServers(): Promise<any>;
    /** @param {{query?: string, limit?: number, offset?: number}} [options] */
    list({ query, limit, offset }?: {
        query?: string;
        limit?: number;
        offset?: number;
    }): Promise<any>;
    /** @param {{limit?: number, offset?: number}} [options] */
    getMine({ limit, offset }?: {
        limit?: number;
        offset?: number;
    }): Promise<any>;
    /** @param {{name: string, visibility: 'public'|'private'|'group', description?: string, groupId?: number|string, iconData?: string, headerImage?: string}} options - group visibility の場合は有効な groupId も必要です */
    create({ name, description, visibility, groupId, iconData, headerImage }?: {
        name: string;
        visibility: "public" | "private" | "group";
        description?: string;
        groupId?: number | string;
        iconData?: string;
        headerImage?: string;
    }): Promise<any>;
    /** @param {number|string} spaceId */
    get(spaceId: number | string): Promise<any>;
    /**
     * @param {number|string} spaceId
     * @param {{name?: string, description?: string, visibility?: 'public'|'private'|'group', groupId?: number|string, iconData?: string, headerImage?: string}} [options]
     */
    update(spaceId: number | string, { name, description, visibility, groupId, iconData, headerImage }?: {
        name?: string;
        description?: string;
        visibility?: "public" | "private" | "group";
        groupId?: number | string;
        iconData?: string;
        headerImage?: string;
    }): Promise<any>;
    /** @param {number|string} spaceId */
    delete(spaceId: number | string): Promise<any>;
    /** @param {number|string} spaceId */
    join(spaceId: number | string): Promise<any>;
    /** @param {number|string} spaceId */
    leave(spaceId: number | string): Promise<any>;
    /**
     * @param {number|string} spaceId
     * @param {{limit?: number, offset?: number}} [options]
     */
    getMembers(spaceId: number | string, { limit, offset }?: {
        limit?: number;
        offset?: number;
    }): Promise<any>;
    /** @param {number|string} spaceId */
    getChannels(spaceId: number | string): Promise<any>;
    /**
     * @param {number|string} spaceId
     * @param {{name?: string, kind?: 'text'|'voice'}} [options]
     */
    createChannel(spaceId: number | string, { name, kind }?: {
        name?: string;
        kind?: "text" | "voice";
    }): Promise<any>;
    /**
     * @param {number|string} spaceId
     * @param {number|string} channelId
     * @param {{name?: string, kind?: 'text'|'voice'}} [options]
     */
    updateChannel(spaceId: number | string, channelId: number | string, { name, kind }?: {
        name?: string;
        kind?: "text" | "voice";
    }): Promise<any>;
    /**
     * @param {number|string} spaceId
     * @param {number|string} channelId
     */
    deleteChannel(spaceId: number | string, channelId: number | string): Promise<any>;
    /**
     * @param {number|string} spaceId
     * @param {number|string} channelId
     * @param {{limit?: number, beforeId?: number|string}} [options]
     */
    getMessages(spaceId: number | string, channelId: number | string, { limit, beforeId }?: {
        limit?: number;
        beforeId?: number | string;
    }): Promise<any>;
    /**
     * @param {number|string} spaceId
     * @param {number|string} channelId
     * @param {{content?: string}} [options]
     */
    sendMessage(spaceId: number | string, channelId: number | string, { content }?: {
        content?: string;
    }): Promise<any>;
    /**
     * @param {number|string} spaceId
     * @param {number|string} messageId
     */
    deleteMessage(spaceId: number | string, messageId: number | string): Promise<any>;
}

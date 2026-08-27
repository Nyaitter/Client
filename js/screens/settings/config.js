export const SETTINGS_GROUP_DETAILS = Object.freeze({
    profile: Object.freeze({
        title: 'プロフィール',
        description: 'プロフィールに表示される情報と画像を設定します。',
    }),
    home: Object.freeze({
        title: 'ホームのカスタマイズ',
        description: 'ホーム画面のタイムラインタブの追加・削除や並び順をカスタマイズします。',
    }),
    privacy: Object.freeze({
        title: 'プライバシーとセキュリティ',
        description: '公開範囲、ログイン保護、アカウント管理を設定します。',
    }),
    ui: Object.freeze({
        title: 'UI / フォント',
        description: '表示形式、テーマ、フォントなどの見た目を設定します。',
    }),
    notifications: Object.freeze({
        title: '通知',
        description: 'この端末でのプッシュ通知の状態を確認・変更します。',
    }),
    storage: Object.freeze({
        title: 'ストレージ',
        description: 'アップロード済みのファイルとストレージ使用量を管理します。',
    }),
    apps: Object.freeze({
        title: '連携アプリ',
        description: 'NyaitterAuthでアクセスを許可したアプリケーションを管理します。',
    }),
    api: Object.freeze({
        title: 'API / Bot',
        description: 'Bot用APIキーを生成・管理します。',
    }),
    imposter: Object.freeze({
        title: 'インポスター',
        description: 'インポスターの作成、共同運用者、権限を管理します。',
    }),
    resources: Object.freeze({
        title: 'リソース',
        description: 'Nyaitterに関するリソースへのリンクを表示します。',
    }),
});

export function getSettingsGroupFromHash(hash = window.location.hash) {
    const match = /^#settings\/([a-z0-9_-]+)/i.exec(hash || '');
    return match ? match[1].toLowerCase() : 'profile';
}

export function normalizeDmInvitation(value) {
    if (value === 'always' || value === 'allow') return 'always';
    if (value === 'deny' || value === 'reject') return 'deny';
    return 'require_approval';
}

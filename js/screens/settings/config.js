export const SETTINGS_GROUP_DETAILS = Object.freeze({
    overview: Object.freeze({ title: '自分に合うNyaitterに', description: '変えたいことから設定を選べます。変更は自動で保存されます。' }),
    account: Object.freeze({ title: 'アカウントとログイン', description: 'ログイン方法、利用中の端末、NyaitterIDを管理します。' }),
    editor: Object.freeze({ title: '投稿とエディタ', description: '文字入力とポスト日時の表示を選びます。' }),
    filters: Object.freeze({ title: 'ミュートとフィルター', description: '見たくない言葉を含むポストを検索から除外します。' }),
    connection: Object.freeze({ title: '通信とデータ使用量', description: '画像とリアルタイム更新の通信量を調整します。' }),
    profile: Object.freeze({
        title: 'プロフィール',
        description: 'プロフィールに表示される情報と画像を設定します。',
    }),
    home: Object.freeze({
        title: 'ホームのカスタマイズ',
        description: 'ホーム画面のタイムラインタブの追加・削除や並び順をカスタマイズします。',
    }),
    privacy: Object.freeze({
        title: '公開範囲とDM',
        description: '他の人に見せる情報と、DMの招待を受け付ける範囲を設定します。',
    }),
    ui: Object.freeze({
        title: '外観と絵文字',
        description: '明るさ、アクセントカラー、絵文字の見た目を変更します。',
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
    return match ? match[1].toLowerCase() : 'overview';
}

export function normalizeDmInvitation(value) {
    if (value === 'always' || value === 'allow') return 'always';
    if (value === 'deny' || value === 'reject') return 'deny';
    return 'require_approval';
}

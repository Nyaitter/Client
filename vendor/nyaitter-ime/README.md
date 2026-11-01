# NyaitterIME（vendored build）

`nyaitter-ime.min.js` は [NyaitterIME](https://github.com/nyaitter/NyaitterIME) の
`5578455f5acb6d0a580d0dfc56e1346671e8f698`（v0.1.2）に
`UPSTREAM.patch` を適用してビルドしたものです。

## 上流との差分

- ハイフンで区切った長音ローマ字（`ki-bo-do`）を 1 つの読みとして扱い、
  短い英語単語（`bo` / `do` / `me`）との誤判定を防ぎます。
- 英語のハイフン語（`e-mail`, `keyboard-shortcut`）は従来どおり保持します。
- 母音の重ね打ち（`kiiboodo`, `suupaa`）を辞書の長音表記（`きーぼーど`）へ
  フォールバックします。Mozc に完全一致がある語（`おおきい`）は変えません。
- 英単語判定をローマ字列の内部一致に適用しないようにし、`kiiboodo` の
  `boo` のような部分一致が日本語変換を妨げないようにしました。
- `src/dictionary/supplements.js` に Mozc 由来辞書の補完データを追加しました
  （`うんち` が `運痴` になる問題を修正）。
- ホスト側が `globalThis.NYAITTER_IME_DICTIONARY_URL` を設定すると、
  大きな辞書データを別 URL から読み込めます。ページ側は既存の固定 CDN URL を
  指定しています。

## 再ビルド

```bash
git clone https://github.com/nyaitter/NyaitterIME
cd NyaitterIME
git checkout 5578455f5acb6d0a580d0dfc56e1346671e8f698
git apply /path/to/UPSTREAM.patch
npm install
npm run build
```

生成物 `dist/nyaitter-ime.min.js` をこのディレクトリへコピーしてください。
`data/nyaitter-ime-core.bin.gz` は変更していないため同梱していません。

## ライセンス

NyaitterIME 本体は MIT License です。辞書などの第三者由来データについては
`THIRD_PARTY_NOTICES.md`、`LICENSE-MOZC`、`LICENSE-ESDB` を参照してください。

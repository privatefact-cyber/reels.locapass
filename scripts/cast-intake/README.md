# キャスト一括登録

## Notion経由(推奨)

Notionデータベース「Modella キャスト登録」: https://app.notion.com/p/6b3c48140e5d4aa3a620ea14c9277ad4

1. データベースに1キャスト1行で追加(源氏名・店舗・年齢・PR文を入力)
2. 写真をGoogle Driveにアップロードし、「リンクを知っている全員が閲覧可」に共有設定
3. その共有リンクを「写真URL」列に貼る(複数枚は改行区切り、1つ目がメイン写真)
4. Claudeに「Notion更新しといて」と伝える

Claudeが行う処理:
- ステータスが「未着手」の行を検出
- 「写真URL」のGoogle Drive共有リンクを直接ダウンロード用URLに変換してダウンロード
- `register-cast-from-json.ts` で登録(写真アップロード→cast_members登録→ログイン発行)
- ステータスを「完了」にしてログインID(メールアドレス)を書き戻す
- 失敗した行は「エラー内容」列に理由を書く(ステータスは「未着手」のまま)

**注意**: 初期パスワードはセキュリティ上Notionには書き込まない(Notionは閲覧・共有範囲が
Supabase管理画面より広がりやすいため)。パスワードは処理後にチャットで直接伝える。

**過去の試行錯誤(参考)**: 当初はNotionページ本文への画像ドラッグ&ドロップを試したが、
同じ操作でも成功する場合と、内部参照(`file://...`)のままダウンロード不能になる場合があり、
原因を特定できなかった(Filesプロパティのセル添付・コメント添付は最初から不可と判明済み)。
再現性の問題を避けるため、Google Driveリンク方式に切り替えた。

## CSV経由(手動/自分で実行する場合)

`npm run register-cast -- --input scripts/cast-intake/casts.csv --photos-dir scripts/cast-intake/photos`

1. `photos/` に写真ファイルを置く
2. `casts.csv` に1キャスト1行で追記する

```
shop,name,age,pr_text,photos
ガールズバー池袋,あかり,24,明るい性格です,akari1.jpg|akari2.jpg
```

- `shop` は店舗名(DBの`shops.name`と完全一致させる)
- `age` / `pr_text` は空欄可
- `photos` は `photos/` 内のファイル名を `|` 区切りで。1枚目がメイン写真になる

3. 上記コマンドを実行する
4. `results/result-<timestamp>.csv` に登録結果(ログインID・初期パスワード込み)が出力される

## 実装

- [scripts/lib/cast-register-core.ts](../lib/cast-register-core.ts) — 登録処理の本体(共通)
- [scripts/register-cast.ts](../register-cast.ts) — CSV入力版
- [scripts/register-cast-from-json.ts](../register-cast-from-json.ts) — JSON入力版(Notion連携で使用)

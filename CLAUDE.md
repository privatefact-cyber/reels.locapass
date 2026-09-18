# modella-reel-portal

## RLSポリシーを追加・変更するときの注意

「公開ページは誰でも見れるようにする」ためのSELECTポリシー(`anon read Xの active shops`
のような名前)を書くときは、**必ず`to anon, authenticated`にする**こと。

`to anon`だけにすると、ログイン中のユーザー(店舗スタッフ・キャスト・運営者アカウント)が
他店舗の公開ページを見たときに0件扱いになり、404や表示欠けを起こす
(2026-08-29に cast_members / media / schedules / cast_diary_entries / shop_events /
shop_price_items の6テーブルでこれが発生し、`supabase/migrations/00034`,`00035`で修正した)。

authenticatedロール向けに「自店舗のみ全権」の別ポリシーが既にある場合でも、それとは別に
「activeな店舗なら閲覧可」もauthenticatedに与える必要がある(RLSポリシーはOR結合されるため、
追加しても既存の制限は緩まない)。`shops`テーブルのように、anon用とauthenticated用を別の
ポリシー名で用意する形でもよい。

新しいテーブル・ポリシーを追加した後は、[supabase/checks/anon_only_select_policies.sql](supabase/checks/anon_only_select_policies.sql)
を実行して、意図せずanon限定のままになっているポリシーが無いか確認すること。

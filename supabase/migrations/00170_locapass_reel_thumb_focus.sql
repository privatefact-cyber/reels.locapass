-- 一覧タイル(正方形)に出すサムネイルの「見せる位置」。縦長の写真を正方形に切るとき、既定は中央で、
-- 顔が切れることがあるため、投稿ごとに位置をずらせるようにする。(2026-11-02、LUXELAと同じ仕組み)
--   thumb_focus_x / thumb_focus_y: 0〜100(%)。CSSの object-position と同じ意味(0=左/上、50=中央、100=右/下)。
--   null=指定なし(従来どおり中央で切り抜く)。
-- 書き込みはサーバー(投稿者本人・店舗スタッフ・運営の確認後にservice roleで更新)。列を足すだけで、既存の行・権限は変わらない。
-- (locapass_reels は匿名にも全列のSELECTが許可されているので、新しい列も自動で読める)
alter table public.locapass_reels
  add column if not exists thumb_focus_x smallint check (thumb_focus_x is null or (thumb_focus_x between 0 and 100)),
  add column if not exists thumb_focus_y smallint check (thumb_focus_y is null or (thumb_focus_y between 0 and 100));

-- リール投稿に「任意のリンク先URL」を追加する。
-- 空欄なら従来通りデフォルトのリンク先(/cast/{id}/reels または /shops/{id}/reels)を使う。
alter table public.reels
  add column link_url text;

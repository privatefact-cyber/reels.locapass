-- 店舗詳細ページのヒーローセクション用: 動画または画像を選んで設定できるようにする。
-- 既存の cover_image_url は一覧サムネイル用途のまま残し、ヒーロー専用のメディアを追加する。
alter table public.shops
  add column hero_media_type text not null default 'image' check (hero_media_type in ('image', 'video')),
  add column hero_media_url text,
  add column tagline text;

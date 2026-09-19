-- 店舗管理画面(/admin/locapass-shops/[shopId])の基本情報フォームにあるのに、
-- locapass_shopsに受け皿の列が無く保存されていなかった項目を追加する。
-- 列名はフォームのフィールド名(=LUXELA本家shopsの列名)に揃える。
--   area               ← name="area"
--   sns_links          ← name="sns_x" / "sns_instagram" / "sns_line" を {x, instagram, line} で保存(本家と同形式)
--   line_qr_image_url  ← name="line_qr_image_url"
--   hero_media_url     ← name="hero_media_url"
--   hero_media_type    ← name="hero_media_url_type"(画像/動画の種別)
--   usage_notes        ← name="usage_notes"
--   shop_code          ← 表示専用(読み取り)。既存店舗にも自動採番する
alter table public.locapass_shops
  add column if not exists area text,
  add column if not exists sns_links jsonb not null default '{}'::jsonb,
  add column if not exists line_qr_image_url text,
  add column if not exists hero_media_url text,
  add column if not exists hero_media_type text not null default 'image',
  add column if not exists usage_notes text,
  add column if not exists shop_code text not null default upper(substr(md5(gen_random_uuid()::text), 1, 6));

alter table public.locapass_shops
  drop constraint if exists locapass_shops_hero_media_type_check,
  add constraint locapass_shops_hero_media_type_check check (hero_media_type in ('image', 'video'));

create unique index if not exists locapass_shops_shop_code_key on public.locapass_shops (shop_code);

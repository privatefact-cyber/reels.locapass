-- 一般的な店舗管理情報(住所・電話番号・営業時間・料金・紹介文・カバー画像)を追加。
alter table public.shops
  add column address text,
  add column phone text,
  add column business_hours text,
  add column price_info text,
  add column description text,
  add column cover_image_url text;

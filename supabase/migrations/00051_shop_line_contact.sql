-- 店舗詳細ページの連絡モーダル(電話・LINE)用。
alter table public.shops
  add column if not exists line_url text,
  add column if not exists line_qr_image_url text;

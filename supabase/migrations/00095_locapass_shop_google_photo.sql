-- Google Places API (New) の写真をカバー画像として正規利用するための補助カラム。
-- 画像バイナリは保存しない(規約上NG)。保存するのは place_id・写真リソース名・撮影者クレジットのみで、
-- 実際の画像は /api/place-photo/[shopId] が表示のたびにGoogleから取得してリダイレクトする。
alter table public.locapass_shops
  add column if not exists google_place_id text,
  add column if not exists google_photo_name text,
  add column if not exists cover_image_attribution jsonb;

comment on column public.locapass_shops.google_place_id is 'Google Places の place_id (保存が許可されている唯一の識別子)';
comment on column public.locapass_shops.google_photo_name is 'Places API (New) の写真リソース名 places/{id}/photos/{ref}。期限切れ時は place_id から再取得する';
comment on column public.locapass_shops.cover_image_attribution is '撮影者クレジット {name, uri}。Googleの写真を表示する際は必ず画像上に表示する';

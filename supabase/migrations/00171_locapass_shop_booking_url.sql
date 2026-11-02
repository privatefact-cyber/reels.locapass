-- 店舗の外部予約URL(民泊・宿泊の施設予約ページなど)。店舗ページに「予約する」ボタンを出す(2026-11-03)。
-- 予約そのものはlocapassでは受けず、入力されたURL(Booking.com / Airbnb / 自社予約ページ等)へ送客するだけ。
-- javascript: などを入れられないよう https のみ許可。
alter table public.locapass_shops
  add column if not exists booking_url text,
  add column if not exists booking_label text;

alter table public.locapass_shops
  drop constraint if exists locapass_shops_booking_url_chk,
  drop constraint if exists locapass_shops_booking_label_chk;

alter table public.locapass_shops
  add constraint locapass_shops_booking_url_chk check (booking_url is null or (booking_url ~ '^https://[^\s]+$' and length(booking_url) <= 500)),
  add constraint locapass_shops_booking_label_chk check (booking_label is null or length(booking_label) <= 20);

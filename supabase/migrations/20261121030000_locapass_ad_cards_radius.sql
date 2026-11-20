-- 店舗の広告カードの配信範囲(広告主のお店からの距離km)。同じ業種の絞り込み(same_category_only)は使わなくなった。2026-11-21。
alter table public.locapass_ad_cards add column if not exists radius_km integer not null default 10;
alter table public.locapass_ad_cards drop constraint if exists locapass_ad_cards_radius_km_check;
alter table public.locapass_ad_cards add constraint locapass_ad_cards_radius_km_check check (radius_km between 1 and 100);

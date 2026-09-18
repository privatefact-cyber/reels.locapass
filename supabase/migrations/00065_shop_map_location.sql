-- マップ機能(GPS地図×縦型動画カルーセル)用に店舗へ位置情報と
-- スポンサー(課金露出)関連のカラムを追加する。
--
-- lat/lng: 店舗の緯度経度。既存店舗にはまだ実測値がないため、このマイグレーション自体は
-- カラム追加のみ行い、値の投入は別途エリア中心座標+ジッターで一括バックフィルする
-- (scripts/backfill-shop-coordinates.ts、または管理画面での個別入力を想定)。
-- is_sponsored/sponsored_rank: 同一ビル・同一エリアでのカード表示順を制御する入札枠。
-- ads.sql (00064) と同じく「まずは最小構成」の思想で、金額や掲載期間は持たない。
alter table public.shops
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists building_name text,
  add column if not exists floor text,
  add column if not exists address_en text,
  add column if not exists supports_english boolean not null default false,
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_sponsored boolean not null default false,
  add column if not exists sponsored_rank integer;

alter table public.shops
  add constraint shops_sponsored_rank_requires_sponsored
  check (sponsored_rank is null or is_sponsored);

-- マップ表示は「lat/lngがある active 店舗」だけを対象にするため、部分インデックスで絞る。
create index if not exists idx_shops_map_location
  on public.shops (area, genre)
  where status = 'active' and lat is not null and lng is not null;

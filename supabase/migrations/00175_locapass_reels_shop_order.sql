-- 店舗詳細ページのリール並び(店舗管理者がドラッグで並べ替え・ピン留め最大10件)。一覧やフィードの並びには影響しない。
alter table public.locapass_reels
  add column if not exists shop_pinned_at timestamptz,
  add column if not exists shop_sort_order integer;

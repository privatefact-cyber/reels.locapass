-- Googleビジネスプロフィールへ、店名・住所も、店舗オーナーが入力したとおりに上書きして送る。
-- 店舗情報を直すのは店舗オーナーで、locapassの内容を正とする。連携を始めたら標準でオン(店舗ごとに切るのも可能)。
alter table public.locapass_gbp_links
  add column if not exists sync_name boolean not null default true,
  add column if not exists sync_address boolean not null default true;

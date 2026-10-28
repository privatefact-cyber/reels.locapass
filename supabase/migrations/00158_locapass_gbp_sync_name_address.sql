-- Googleビジネスプロフィールへ、店名・住所もlocapassの内容で上書きして送れるようにする(店舗ごとのオプション)。
-- locapassの店名には読み仮名(括弧書き)が入るものがあり、そのままではGoogleの店名ルールに合わないため、標準はオフ。
alter table public.locapass_gbp_links
  add column if not exists sync_name boolean not null default false,
  add column if not exists sync_address boolean not null default false;

-- 車検証の読取(AI画像読取)の利用回数の記録。2026-10-28。
-- 画像・読取結果はどこにも保存しない。「誰が・どの店舗で・いつ読んだか」だけを持ち、1店舗あたりの1日の回数制限(費用の暴走防止)に使う。
-- 書き込み・読み取りはサーバー(service role)だけ。一般ユーザーには何も見せない(RLSを有効にして、ポリシーは作らない)。
create table if not exists public.locapass_vehicle_cert_scans (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists locapass_vehicle_cert_scans_shop_idx on public.locapass_vehicle_cert_scans (shop_id, created_at desc);
alter table public.locapass_vehicle_cert_scans enable row level security;

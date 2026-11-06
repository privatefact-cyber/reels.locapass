-- ワンコ手帳のログイン・登録画面の「このメールアドレスはLOCAPASSに登録済みです」の確認回数の記録。2026-11-07。
-- 他人のメールアドレスを総当たりで調べられないよう、送信元IPのハッシュ(生のIPは持たない)ごとに1時間の上限をかける。サーバーだけ。
create table if not exists public.locapass_pet_email_checks (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists locapass_pet_email_checks_ip_idx on public.locapass_pet_email_checks (ip_hash, created_at desc);
alter table public.locapass_pet_email_checks enable row level security;

-- ロカわんのiPhoneアプリへのプッシュ通知(APNs)の送り先。1端末=1行(トークンが一意)。
-- 端末から届くトークンを、サーバー(service_role)だけが読み書きする(画面・他の人には見せない)。
-- environment: Appleの送信先。開発ビルド=sandbox、TestFlight/App Store=production。送ってみて通ったほうを覚える。
create table if not exists public.locapass_apns_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  environment text check (environment in ('production', 'sandbox')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_locapass_apns_tokens_user on public.locapass_apns_tokens (user_id);
-- RLSを有効にしてポリシーは作らない = anon/authenticated からは一切触れない(service_roleだけが使える)
alter table public.locapass_apns_tokens enable row level security;
revoke all on public.locapass_apns_tokens from anon, authenticated;
comment on table public.locapass_apns_tokens is 'ロカわんiOSアプリのAPNsトークン。service_role専用。';

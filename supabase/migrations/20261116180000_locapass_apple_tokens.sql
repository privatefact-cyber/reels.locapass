-- 「Appleでサインイン」で入った人の、Appleの更新用トークン(refresh token)。
-- アカウント削除のときに、Appleのサーバーへ「この連携を取り消す」と伝えるために使う(Appleの審査で必須)。
-- サーバー(service_role)だけが読み書きする。画面・他の人には見せない。
create table if not exists public.locapass_apple_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLSを有効にしてポリシーは作らない = anon/authenticated からは一切触れない(service_roleだけが使える)
alter table public.locapass_apple_tokens enable row level security;
revoke all on public.locapass_apple_tokens from anon, authenticated;
comment on table public.locapass_apple_tokens is 'Appleでサインインの更新用トークン。アカウント削除時の取り消し用。service_role専用。';

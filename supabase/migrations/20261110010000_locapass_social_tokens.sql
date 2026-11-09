-- SNS(Instagram/Threads)の長期トークンを、期限前に自動で延長して保存する。サービスロール経由のみ(RLS有効・ポリシー無し)。
-- env_fingerprint: 延長の元にした環境変数トークンの指紋。環境変数を手で入れ直したら、保存済みより環境変数を優先する。
create table if not exists public.locapass_social_tokens (
  platform text not null check (platform in ('instagram', 'threads')),
  account text not null check (account in ('locapass', 'luxela')),
  token text,
  env_fingerprint text,
  expires_at timestamptz,
  refreshed_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  fail_count integer not null default 0,
  primary key (platform, account)
);
alter table public.locapass_social_tokens enable row level security;

-- Meta API の実機監査の結果(読み取りの確認だけ。トークンや他人の投稿の中身は保存しない)。
create table if not exists public.locapass_social_api_audit (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  platform text not null check (platform in ('threads', 'instagram')),
  account text not null check (account in ('locapass', 'luxela')),
  probe text not null,
  label text not null,
  needs text not null default '',
  status text not null check (status in ('ok', 'error', 'skipped')),
  http_status integer,
  error_code integer,
  error_subcode integer,
  message text,
  items integer,
  keys text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists locapass_social_api_audit_run_idx on public.locapass_social_api_audit (created_at desc, run_id);
alter table public.locapass_social_api_audit enable row level security;
revoke all on public.locapass_social_api_audit from anon, authenticated;

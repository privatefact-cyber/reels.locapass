-- SNS自動運転の安全設定。初期値は全投稿先とも停止。
create table if not exists public.locapass_social_automation (
  platform text not null check (platform in ('threads', 'instagram')),
  account text not null check (account in ('locapass', 'luxela')),
  enabled boolean not null default false,
  mode text not null default 'draft' check (mode in ('draft', 'auto')),
  source text not null default 'shop' check (source in ('ai', 'shop')),
  run_hour_jst smallint not null default 12 check (run_hour_jst between 0 and 23),
  daily_max smallint not null default 1 check (daily_max between 1 and 3),
  emergency_stop boolean not null default false,
  last_run_on date,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (platform, account)
);
insert into public.locapass_social_automation (platform, account)
values ('threads','locapass'), ('instagram','locapass'), ('threads','luxela'), ('instagram','luxela')
on conflict do nothing;
alter table public.locapass_social_automation enable row level security;
revoke all on public.locapass_social_automation from anon, authenticated;

-- cronの重複実行を防ぐ記録。
create table if not exists public.locapass_social_automation_runs (
  platform text not null,
  account text not null,
  run_on date not null,
  status text not null check (status in ('running', 'drafted', 'posted', 'failed')),
  post_id uuid references public.locapass_threads_posts(id) on delete set null,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (platform, account, run_on)
);
alter table public.locapass_social_automation_runs enable row level security;
revoke all on public.locapass_social_automation_runs from anon, authenticated;

-- 投稿ごとの日次成績。履歴を残すので、伸び方も後から比較できる。
create table if not exists public.locapass_social_insights (
  post_id uuid not null references public.locapass_threads_posts(id) on delete cascade,
  collected_on date not null,
  views bigint not null default 0,
  reach bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  replies bigint not null default 0,
  reposts bigint not null default 0,
  quotes bigint not null default 0,
  shares bigint not null default 0,
  saves bigint not null default 0,
  total_interactions bigint not null default 0,
  raw_metrics jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  primary key (post_id, collected_on)
);
create index if not exists locapass_social_insights_day_idx on public.locapass_social_insights (collected_on desc);
alter table public.locapass_social_insights enable row level security;
revoke all on public.locapass_social_insights from anon, authenticated;

alter table public.locapass_threads_posts add column if not exists insights_checked_at timestamptz;
alter table public.locapass_threads_posts add column if not exists insights_error text;

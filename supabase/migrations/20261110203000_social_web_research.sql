alter table public.locapass_social_automation drop constraint if exists locapass_social_automation_source_check;
alter table public.locapass_social_automation add constraint locapass_social_automation_source_check check (source in ('ai', 'shop', 'research'));

create table if not exists public.locapass_social_research (
  id uuid primary key default gen_random_uuid(),
  account text not null check (account in ('locapass','luxela')),
  title text not null,
  summary text not null,
  why_now text not null,
  audience_value text not null,
  score smallint not null check (score between 0 and 100),
  body text not null,
  sources jsonb not null default '[]'::jsonb,
  search_queries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists locapass_social_research_created_idx on public.locapass_social_research(account, created_at desc);
alter table public.locapass_social_research enable row level security;
revoke all on public.locapass_social_research from anon, authenticated;

alter table public.locapass_reels add column if not exists translations jsonb not null default '{}'::jsonb;

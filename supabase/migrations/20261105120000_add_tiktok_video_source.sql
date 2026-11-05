alter table public.locapass_youtube_ingestions
  add column if not exists source_provider text not null default 'youtube',
  add column if not exists source_id text,
  add column if not exists thumbnail_url text;

update public.locapass_youtube_ingestions
set source_id = youtube_id
where source_id is null;

alter table public.locapass_youtube_ingestions
  drop constraint if exists locapass_youtube_ingestions_youtube_id_check;

alter table public.locapass_youtube_ingestions
  alter column youtube_id drop not null;

alter table public.locapass_youtube_ingestions
  add constraint locapass_youtube_ingestions_source_provider_check
  check (source_provider in ('youtube', 'tiktok'));

create unique index if not exists locapass_youtube_ingestions_source_uidx
  on public.locapass_youtube_ingestions (portal_id, source_provider, source_id)
  where source_id is not null;

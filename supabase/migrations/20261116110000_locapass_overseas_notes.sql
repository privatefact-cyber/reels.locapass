-- 海外の情報集め(個人用の下調べ)。YouTube動画を検索して、日本語の要約つきで管理者だけが見る。公開はしない。
-- region: cebu など。アプリ(管理画面)からだけ、サービスロールで読み書きする(ポリシーなし=一般には見えない)。
create table if not exists public.locapass_overseas_notes (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  youtube_id text not null,
  title text not null,
  description text,
  channel_title text,
  published_at timestamptz,
  duration_seconds int,
  source_query text,
  title_ja text,
  summary_ja text,
  place_name text,
  area text,
  category text,
  relevant boolean not null default true,
  starred boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (region, youtube_id)
);
create index if not exists locapass_overseas_notes_region_idx on public.locapass_overseas_notes (region, created_at desc);
alter table public.locapass_overseas_notes enable row level security;

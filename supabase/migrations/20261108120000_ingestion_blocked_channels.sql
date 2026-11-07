-- 動画ストックで「今後収集しない」にしたチャンネルの一覧(LUXELAとLOCAPASSで共用。site 列で区別する)。
-- 収集(YouTube検索)で候補を保存するとき、ここにあるチャンネルの動画は入れない。YouTubeの収集結果にチャンネルIDを保存していないので、チャンネル名で照合する。
-- 書き込みも読み取りもサーバー(service role)のみ。anon/authenticatedには一切開放しない。
create table if not exists public.ingestion_blocked_channels (
  site text not null check (site in ('luxela', 'locapass')),
  channel_title text not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (site, channel_title)
);
alter table public.ingestion_blocked_channels enable row level security;
revoke all on public.ingestion_blocked_channels from anon, authenticated;

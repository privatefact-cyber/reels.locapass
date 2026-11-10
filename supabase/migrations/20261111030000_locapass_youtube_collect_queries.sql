-- YouTube Shorts 自動収集(cron)の検索語を、管理画面から変えられるようにする。
-- queries が null の行は「コードに書いてある初期の検索語」を使う(=デフォルトに戻す操作は null に戻すだけ)。
-- サービスロール経由でのみ読み書きする(RLSは有効・ポリシー無し)。
create table if not exists public.locapass_youtube_collect_queries (
  job text primary key check (job in ('gourmet', 'beauty')),
  queries text[],
  updated_at timestamptz not null default now()
);
alter table public.locapass_youtube_collect_queries enable row level security;
insert into public.locapass_youtube_collect_queries (job) values ('gourmet'), ('beauty') on conflict do nothing;

-- アプリ発のLINEログインの「受け渡しページ」を、数分だけ覚えておく(サーバーだけが読み書きする)。
-- LINEが、1回の承認で、同じ認可コードの戻りを2か所(LINE内のブラウザとChrome)で開くことがあり、
-- 2回目は、コードが使用済みで失敗する。2回目にも、同じ「アプリに戻る」ページを返すために使う。
create table if not exists public.locapass_app_handoffs (
  state text primary key,
  app_url text not null,
  created_at timestamptz not null default now()
);
alter table public.locapass_app_handoffs enable row level security;
create index if not exists locapass_app_handoffs_created_idx on public.locapass_app_handoffs (created_at);

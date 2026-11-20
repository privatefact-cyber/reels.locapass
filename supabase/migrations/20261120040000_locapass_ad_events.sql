-- 店舗ページの広告枠(自社告知・編集枠・将来の外部広告)の表示/タップの記録。2026-11-20。
-- IPは保存しない(日ごとに変わる匿名のvidだけ)。書き込みはサーバー(service role)からだけ。RLSを有効にしてポリシーを作らない=一般のユーザーは読み書きできない。
create table if not exists public.locapass_ad_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  day date not null,
  slot text not null check (slot in ('mid', 'bottom')),
  creative text not null check (char_length(creative) <= 80),
  kind text not null check (kind in ('imp', 'tap')),
  shop_id uuid references public.locapass_shops(id) on delete set null,
  locale text,
  vid text
);
create index if not exists locapass_ad_events_day_idx on public.locapass_ad_events (day, creative, kind);
alter table public.locapass_ad_events enable row level security;

-- 店舗情報の拡張: 公式HP・SNSリンク・利用説明を追加。
alter table public.shops
  add column website_url text,
  add column sns_links jsonb not null default '{}'::jsonb,
  add column usage_notes text;

-- 料金表: 単一テキストではなく「コース×時間×料金」の一覧として管理する。
create table public.shop_price_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  duration_minutes integer,
  price integer not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_shop_price_items_shop_id on public.shop_price_items (shop_id, display_order);

alter table public.shop_price_items enable row level security;

create policy "anon read price items of active shops"
  on public.shop_price_items for select
  to anon
  using (exists (
    select 1 from public.shops s where s.id = shop_id and s.status = 'active'
  ));

create policy "authenticated full access own price items"
  on public.shop_price_items for all
  to authenticated
  using (shop_id in (select public.current_shop_ids()))
  with check (shop_id in (select public.current_shop_ids()));

-- イベント告知
create table public.shop_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  title text not null,
  body text,
  event_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_shop_events_shop_id on public.shop_events (shop_id, created_at desc);

create trigger trg_shop_events_set_updated_at
  before update on public.shop_events
  for each row
  execute function public.set_updated_at();

alter table public.shop_events enable row level security;

create policy "anon read events of active shops"
  on public.shop_events for select
  to anon
  using (exists (
    select 1 from public.shops s where s.id = shop_id and s.status = 'active'
  ));

create policy "authenticated full access own events"
  on public.shop_events for all
  to authenticated
  using (shop_id in (select public.current_shop_ids()))
  with check (shop_id in (select public.current_shop_ids()));

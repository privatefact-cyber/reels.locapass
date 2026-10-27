-- 店舗の「掲載アイテム」(車両の在庫など)。2026-10-27。
-- 車・料理・物件などで使い回せるよう汎用の形にしてある。業種ごとの項目は attributes(jsonb)に入れる。
--   vehicle: { year, mileage_km, inspection, color }
-- どのポータルで使うかは locapass_portals.features で決める(現在は motors だけ 'items')。
-- 公開側は「非表示(hidden)以外」を誰でも読める。書き込みは店舗の管理者(locapass_is_shop_admin)だけ。

alter table public.locapass_portals add column if not exists features text[] not null default '{}';
update public.locapass_portals set features = array['items'] where slug = 'motors';

create table if not exists public.locapass_shop_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  kind text not null default 'vehicle',
  title text not null check (char_length(title) between 1 and 80),
  price bigint check (price is null or price >= 0),
  price_label text check (price_label is null or char_length(price_label) <= 20),
  status text not null default 'available' check (status in ('available', 'reserved', 'sold', 'hidden')),
  description text check (description is null or char_length(description) <= 1000),
  image_urls text[] not null default '{}',
  attributes jsonb not null default '{}'::jsonb,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists locapass_shop_items_shop_idx
  on public.locapass_shop_items (shop_id, display_order, created_at desc);

alter table public.locapass_shop_items enable row level security;

-- 公開用SELECTは anon と authenticated の両方に付ける(authenticatedだけ0件になる事故を避ける)。
drop policy if exists shop_items_public_read on public.locapass_shop_items;
create policy shop_items_public_read on public.locapass_shop_items for select
  to anon, authenticated
  using (
    status <> 'hidden'
    and exists (select 1 from public.locapass_shops s where s.id = shop_id and s.status = 'active')
  );

drop policy if exists shop_items_admin_all on public.locapass_shop_items;
create policy shop_items_admin_all on public.locapass_shop_items for all
  to authenticated
  using (public.locapass_is_shop_admin(shop_id))
  with check (public.locapass_is_shop_admin(shop_id));

grant select on public.locapass_shop_items to anon, authenticated;
grant insert, update, delete on public.locapass_shop_items to authenticated;

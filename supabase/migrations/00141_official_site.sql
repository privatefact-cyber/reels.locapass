-- 店舗の公式サイト(LOCAPASSから配信する公式HP)用のテーブル。2026-10-27。
-- 原本はLOCAPASS: 車両は locapass_shop_items、住所・電話・写真は locapass_shops をそのまま使い、
-- ここには「公式サイトだけで使う文言」と「ブログ記事」を持つ。
-- 更新できるのはその店舗の管理者(locapass_is_shop_admin)だけ。読み取りは公開。

-- サイトの文言(キーと値)。キーに無いものは公式サイト側の既定の文言で表示する。
create table if not exists public.official_site_content (
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  key text not null,
  value text not null default '',
  updated_at timestamptz not null default now(),
  primary key (shop_id, key)
);

-- ブログ記事。本文は段落ごとの文章、写真は複数枚。
create table if not exists public.official_posts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 20000),
  cover_url text,
  image_urls text[] not null default '{}',
  status text not null default 'published' check (status in ('draft', 'published')),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  translations jsonb not null default '{}'::jsonb
);
create index if not exists official_posts_shop_idx on public.official_posts (shop_id, status, published_at desc);

alter table public.official_site_content enable row level security;
alter table public.official_posts enable row level security;

-- 公開用SELECTは anon と authenticated の両方に付ける。
drop policy if exists official_content_read on public.official_site_content;
create policy official_content_read on public.official_site_content for select
  to anon, authenticated
  using (exists (select 1 from public.locapass_shops s where s.id = shop_id and s.status = 'active'));
drop policy if exists official_content_admin on public.official_site_content;
create policy official_content_admin on public.official_site_content for all
  to authenticated
  using (public.locapass_is_shop_admin(shop_id))
  with check (public.locapass_is_shop_admin(shop_id));

drop policy if exists official_posts_read on public.official_posts;
create policy official_posts_read on public.official_posts for select
  to anon, authenticated
  using (
    status = 'published' and published_at <= now()
    and exists (select 1 from public.locapass_shops s where s.id = shop_id and s.status = 'active')
  );
drop policy if exists official_posts_admin on public.official_posts;
create policy official_posts_admin on public.official_posts for all
  to authenticated
  using (public.locapass_is_shop_admin(shop_id))
  with check (public.locapass_is_shop_admin(shop_id));

grant select on public.official_site_content, public.official_posts to anon, authenticated;
grant insert, update, delete on public.official_site_content, public.official_posts to authenticated;

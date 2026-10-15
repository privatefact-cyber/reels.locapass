-- 緊急ブースト(ドタキャン・作りすぎ等を1時間限定で告知する来店誘導投稿)。(2026-10-15)
-- 決済は挟まない。ユーザーは見て店舗へ向かい「locapassを見た」と伝えるだけ。

create table if not exists public.locapass_boost_posts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null check (char_length(description) between 1 and 600),
  image_url text,
  discount_tag text check (discount_tag is null or char_length(discount_tag) <= 20),
  status text not null default 'active' check (status in ('active', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour')
);

create index if not exists locapass_boost_posts_live_idx
  on public.locapass_boost_posts (expires_at desc) where status = 'active';
create index if not exists locapass_boost_posts_shop_idx
  on public.locapass_boost_posts (shop_id, created_at desc);

-- 作成時は掲載時間を必ず60分に固定し(クライアント値は無視)、同時掲載は1店舗3件までにする。
-- 更新は「早期終了(status→expired)」だけ許す。
create or replace function public.locapass_boost_posts_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.expires_at := now() + interval '1 hour';
    new.status := 'active';
    if (select count(*) from public.locapass_boost_posts b
         where b.shop_id = new.shop_id and b.status = 'active' and b.expires_at > now()) >= 3 then
      raise exception 'boost_limit: 同時に掲載できるブーストは3件までです';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.shop_id is distinct from old.shop_id
       or new.title is distinct from old.title or new.description is distinct from old.description
       or new.image_url is distinct from old.image_url or new.discount_tag is distinct from old.discount_tag
       or new.created_at is distinct from old.created_at or new.expires_at is distinct from old.expires_at then
      raise exception 'boost_immutable: ブーストの内容は変更できません(終了のみ可能です)';
    end if;
    if new.status <> 'expired' then
      raise exception 'boost_immutable: 終了以外の変更はできません';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists locapass_boost_posts_guard_trg on public.locapass_boost_posts;
create trigger locapass_boost_posts_guard_trg
  before insert or update on public.locapass_boost_posts
  for each row execute function public.locapass_boost_posts_guard();

alter table public.locapass_boost_posts enable row level security;

-- 公開: 掲載中(active かつ期限内)で、店舗が公開中のものだけ。
drop policy if exists boost_public_read on public.locapass_boost_posts;
create policy boost_public_read on public.locapass_boost_posts for select
  using (
    status = 'active' and expires_at > now()
    and exists (select 1 from public.locapass_shops s where s.id = shop_id and s.status = 'active')
  );

-- 店舗の管理者(本人・担当エリア管理者・運営)は自店舗の履歴をすべて読める/作れる/終了できる。
drop policy if exists boost_admin_read on public.locapass_boost_posts;
create policy boost_admin_read on public.locapass_boost_posts for select
  using (public.locapass_is_shop_admin(shop_id));
drop policy if exists boost_admin_insert on public.locapass_boost_posts;
create policy boost_admin_insert on public.locapass_boost_posts for insert
  with check (public.locapass_is_shop_admin(shop_id));
drop policy if exists boost_admin_update on public.locapass_boost_posts;
create policy boost_admin_update on public.locapass_boost_posts for update
  using (public.locapass_is_shop_admin(shop_id)) with check (public.locapass_is_shop_admin(shop_id));

grant select on public.locapass_boost_posts to anon, authenticated;
grant insert, update on public.locapass_boost_posts to authenticated;

-- 一覧は新着が出たら画面を更新できるよう Realtime に載せる。
alter publication supabase_realtime add table public.locapass_boost_posts;

-- リール機能: キャストが投稿する縦型フィード投稿。
-- portal.modella.jp(WordPress版)のreel機能と同じ思想:
--   - キャスト本人が投稿(cast_members.user_idで本人を特定)
--   - 検索はshops.area/address/name(キーワード)とshops.genre(タグ、複数選択)を流用したシンプルなもの
--   - いいねはログイン不要、クライアント生成のviewer_idで重複だけ緩く防ぐ

-- =========================================================
-- 1. cast_members にログイン(招待)を紐付け
-- =========================================================
alter table public.cast_members
  add column user_id uuid references auth.users (id) on delete set null;

create unique index cast_members_user_id_key
  on public.cast_members (user_id)
  where user_id is not null;

-- 現在ログイン中のユーザーに対応するcast_idを返す。
-- current_shop_ids()と同じ思想(00002_harden_function_privileges.sqlでanonから権限剥奪する)。
create or replace function public.current_cast_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.cast_members where user_id = auth.uid() limit 1;
$$;

revoke all on function public.current_cast_id() from public;
revoke execute on function public.current_cast_id() from anon;
grant execute on function public.current_cast_id() to authenticated;

-- =========================================================
-- 2. reels
-- =========================================================
create table public.reels (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.cast_members (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  caption text,
  media jsonb not null default '[]'::jsonb, -- [{type:'video'|'image', url, poster}]
  likes_count integer not null default 0,
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now()
);

create index idx_reels_shop_id on public.reels (shop_id, created_at desc);
create index idx_reels_cast_id on public.reels (cast_id, created_at desc);

alter table public.reels enable row level security;

create policy "anon read published reels of active shops"
  on public.reels for select
  to anon, authenticated
  using (
    status = 'published'
    and exists (select 1 from public.shops s where s.id = shop_id and s.status = 'active')
  );

create policy "cast insert own reels"
  on public.reels for insert
  to authenticated
  with check (cast_id = public.current_cast_id());

create policy "cast update own reels"
  on public.reels for update
  to authenticated
  using (cast_id = public.current_cast_id())
  with check (cast_id = public.current_cast_id());

create policy "cast or shop delete own reels"
  on public.reels for delete
  to authenticated
  using (
    cast_id = public.current_cast_id()
    or shop_id in (select public.current_shop_ids())
    or public.is_platform_admin()
  );

-- shop_idはcast_idから自動で埋める(クライアントに信頼させない)。
create or replace function public.set_reel_shop_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select shop_id into new.shop_id from public.cast_members where id = new.cast_id;
  return new;
end;
$$;

revoke all on function public.set_reel_shop_id() from public;

create trigger trg_reels_set_shop_id
  before insert on public.reels
  for each row
  execute function public.set_reel_shop_id();

-- =========================================================
-- 3. reel_likes (ログイン不要、クライアント生成viewer_idでトグル)
-- =========================================================
create table public.reel_likes (
  reel_id uuid not null references public.reels (id) on delete cascade,
  viewer_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (reel_id, viewer_id)
);

alter table public.reel_likes enable row level security;

create policy "anyone add own like"
  on public.reel_likes for insert
  to anon, authenticated
  with check (true);

create policy "anyone remove own like"
  on public.reel_likes for delete
  to anon, authenticated
  using (true);

create or replace function public.sync_reel_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.reels set likes_count = likes_count + 1 where id = new.reel_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.reels set likes_count = greatest(likes_count - 1, 0) where id = old.reel_id;
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.sync_reel_likes_count() from public;

create trigger trg_reel_likes_sync_insert
  after insert on public.reel_likes
  for each row
  execute function public.sync_reel_likes_count();

create trigger trg_reel_likes_sync_delete
  after delete on public.reel_likes
  for each row
  execute function public.sync_reel_likes_count();

-- =========================================================
-- 4. Storage: reels バケット(公開読み取り、本人のフォルダのみ書き込み)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('reels', 'reels', true)
on conflict (id) do nothing;

create policy "public read reel media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'reels');

create policy "cast upload own reel media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'reels'
    and (storage.foldername(name))[1] = public.current_cast_id()::text
  );

create policy "cast delete own reel media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'reels'
    and (storage.foldername(name))[1] = public.current_cast_id()::text
  );

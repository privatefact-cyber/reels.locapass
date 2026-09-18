-- 一般ユーザー(客)向けプライベートマイページ機能。
-- 店舗・キャスト側の current_cast_id() / current_shop_ids() と同じ思想で、
-- ここでは auth.uid() をそのまま「自分の行だけ触れる」RLSの主語にする
-- (一般ユーザーはcast_members/shop_staff_membersのような別テーブルへの
--  紐付けが不要なため、専用のcurrent_xxx_id()関数は用意しない)。

-- =========================================================
-- 1. user_profiles(ニックネーム・アバターのみを持つ最小プロフィール)
-- =========================================================
create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default 'ゲスト',
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "user read own profile"
  on public.user_profiles for select
  to authenticated
  using (id = auth.uid());

create policy "user update own profile"
  on public.user_profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 新規サインアップ時に自動でプロフィール行を作る(ソーシャル/メールどちらでも共通)。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- =========================================================
-- 2. reel_likes / reel_comments にログインユーザーを紐付け
--    (匿名のviewer_id運用はそのまま維持し、ログイン中はuser_idも併記する)
-- =========================================================
alter table public.reel_likes
  add column user_id uuid references auth.users (id) on delete cascade;

create index idx_reel_likes_user_id on public.reel_likes (user_id, created_at desc)
  where user_id is not null;

create or replace function public.set_reel_likes_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

revoke all on function public.set_reel_likes_user_id() from public;

create trigger trg_reel_likes_set_user_id
  before insert on public.reel_likes
  for each row
  execute function public.set_reel_likes_user_id();

alter table public.reel_comments
  add column user_id uuid references auth.users (id) on delete cascade;

create index idx_reel_comments_user_id on public.reel_comments (user_id, created_at desc)
  where user_id is not null;

create or replace function public.set_reel_comments_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.author_type = 'customer' then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.set_reel_comments_user_id() from public;

create trigger trg_reel_comments_set_user_id
  before insert on public.reel_comments
  for each row
  execute function public.set_reel_comments_user_id();

create policy "user delete own comment"
  on public.reel_comments for delete
  to authenticated
  using (author_type = 'customer' and user_id = auth.uid());

-- =========================================================
-- 3. user_cast_follows(推しキャスト) / user_shop_favorites(店舗ストック)
-- =========================================================
create table public.user_cast_follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  cast_id uuid not null references public.cast_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, cast_id)
);

alter table public.user_cast_follows enable row level security;

create policy "user manage own cast follows"
  on public.user_cast_follows for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table public.user_shop_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);

alter table public.user_shop_favorites enable row level security;

create policy "user manage own shop favorites"
  on public.user_shop_favorites for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- トリガー内部でのみ使う関数なので、anon/authenticatedからの直接RPC実行を明示的に塞ぐ
-- (security advisor: SECURITY DEFINER関数がPUBLIC経由で実行可能という指摘への対応)。
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.set_reel_likes_user_id() from anon, authenticated;
revoke execute on function public.set_reel_comments_user_id() from anon, authenticated;

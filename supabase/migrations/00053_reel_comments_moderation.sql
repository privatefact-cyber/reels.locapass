-- reel_comments のモデレーション機能: ソフト削除、キャストによるシャドウバン(ブロック)、
-- 運営によるサイト全体BAN、簡易NGワードフィルター。
-- (直前の00052で追加したreel_comments拡張の上に重ねる。実データは引き続き0件)

-- ---- 1. ソフト削除 ----
alter table public.reel_comments
  add column is_deleted boolean not null default false;

-- 既存の「本人のみ物理削除」ポリシーは、ソフト削除ベースのポリシー群に置き換える。
drop policy "user delete own comment" on public.reel_comments;

create policy "author soft delete own comment"
  on public.reel_comments for update
  to authenticated
  using (author_type = 'customer' and user_id = auth.uid())
  with check (author_type = 'customer' and user_id = auth.uid());

create policy "cast delete comments on own reel"
  on public.reel_comments for update
  to authenticated
  using (exists (select 1 from public.reels r where r.id = reel_id and r.cast_id = public.current_cast_id()))
  with check (exists (select 1 from public.reels r where r.id = reel_id and r.cast_id = public.current_cast_id()));

create policy "shop staff delete comments of own cast reels"
  on public.reel_comments for update
  to authenticated
  using (exists (select 1 from public.reels r where r.id = reel_id and r.shop_id in (select public.current_shop_ids())))
  with check (exists (select 1 from public.reels r where r.id = reel_id and r.shop_id in (select public.current_shop_ids())));

create policy "platform admin delete any comment"
  on public.reel_comments for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---- 2. キャストによるユーザーのシャドウバン(ブロック) ----
create table public.cast_blocked_users (
  cast_id uuid not null references public.cast_members (id) on delete cascade,
  blocked_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cast_id, blocked_user_id)
);

alter table public.cast_blocked_users enable row level security;

create policy "cast manage own blocks"
  on public.cast_blocked_users for all
  to authenticated
  using (cast_id = public.current_cast_id())
  with check (cast_id = public.current_cast_id());

create policy "platform admin manage all blocks"
  on public.cast_blocked_users for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- 閲覧ポリシーを、削除済み非表示 + シャドウバン(本人以外には見せない)対応版に差し替える。
drop policy "anon read comments of published reels" on public.reel_comments;

create policy "read visible comments of published reels"
  on public.reel_comments for select
  to anon, authenticated
  using (
    is_deleted = false
    and exists (
      select 1 from public.reels r
      join public.shops s on s.id = r.shop_id
      where r.id = reel_id and r.status = 'published' and s.status = 'active'
    )
    and (
      author_type <> 'customer'
      or user_id = auth.uid()
      or not exists (
        select 1
        from public.reels r2
        join public.cast_blocked_users b on b.cast_id = r2.cast_id
        where r2.id = reel_id and b.blocked_user_id = reel_comments.user_id
      )
    )
  );

-- ---- 3. 運営によるサイト全体BAN ----
-- user_profilesに直接is_bannedを持たせると本人が「自分のプロフィール更新」ポリシー経由で
-- 解除できてしまうため、専用テーブル(一般ユーザーからは一切アクセス不可)にする。
create table public.banned_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  banned_by uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.banned_users enable row level security;

create policy "platform admin manage banned users"
  on public.banned_users for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- 客のコメント投稿ポリシーにBANチェックを追加する(既存ポリシーを作り直し)。
drop policy "authenticated customer add one comment per reel" on public.reel_comments;

create policy "authenticated customer add one comment per reel"
  on public.reel_comments for insert
  to authenticated
  with check (
    author_type = 'customer'
    and parent_comment_id is null
    and not exists (select 1 from public.banned_users where user_id = auth.uid())
    and exists (
      select 1 from public.reels r
      join public.shops s on s.id = r.shop_id
      where r.id = reel_id and r.status = 'published' and s.status = 'active'
    )
    and not exists (
      select 1 from public.reel_comments c
      where c.reel_id = reel_id
        and c.author_type = 'customer'
        and c.user_id = auth.uid()
    )
  );

-- ---- 4. 簡易NGワードフィルター(サーバー側の最終防衛) ----
create or replace function public.reject_reel_comment_ng_words()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ng_words text[] := array['死ね', '殺す', 'ブス', '晒す', 'きもい', 'ぶさいく', 'デブス'];
  w text;
begin
  foreach w in array ng_words loop
    if new.body like '%' || w || '%' then
      raise exception 'ng_word_detected' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

create trigger trg_reel_comments_ng_word_check
  before insert on public.reel_comments
  for each row
  execute function public.reject_reel_comment_ng_words();

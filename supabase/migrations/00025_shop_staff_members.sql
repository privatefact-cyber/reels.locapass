-- 【スタッフアカウント(黒服)機能】
-- 既存の shop_staff(店舗の管理者ログイン、/dashboard全体にフルアクセス)とは別に、
-- 個々のスタッフが自分の名前・アイコンで使う軽量アカウントを新設する。
-- 発行はキャスト招待(cast_login_tokens/00023)と全く同じ「マジックリンク」方式。
-- 権限は発行元の1店舗のみ・自分の投稿のみ編集削除、という狭いスコープに限定する。

create table public.shop_staff_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  avatar_url text,
  bio text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index shop_staff_members_user_id_key
  on public.shop_staff_members (user_id)
  where user_id is not null;

create index idx_shop_staff_members_shop_id on public.shop_staff_members (shop_id);

alter table public.shop_staff_members enable row level security;

-- 公開プロフィール(名前・アイコン)。投稿の著者表示に使うため、castと同じく匿名read可。
create policy "anon read staff of active shops"
  on public.shop_staff_members for select
  to anon, authenticated
  using (exists (select 1 from public.shops s where s.id = shop_id and s.status = 'active'));

-- 管理者(既存shop_staff)が自店舗のスタッフを追加・改廃できる。
create policy "shop admin manage own staff members"
  on public.shop_staff_members for all
  to authenticated
  using (shop_id in (select public.current_shop_ids()) or public.is_platform_admin())
  with check (shop_id in (select public.current_shop_ids()) or public.is_platform_admin());

-- 現在ログイン中のスタッフアカウントのid/所属店舗を返す(current_cast_id()と同じ思想)。
create or replace function public.current_staff_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.shop_staff_members where user_id = auth.uid() limit 1;
$$;

revoke all on function public.current_staff_member_id() from public;
revoke execute on function public.current_staff_member_id() from anon;
grant execute on function public.current_staff_member_id() to authenticated;

create or replace function public.current_staff_shop_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select shop_id from public.shop_staff_members where user_id = auth.uid() limit 1;
$$;

revoke all on function public.current_staff_shop_id() from public;
revoke execute on function public.current_staff_shop_id() from anon;
grant execute on function public.current_staff_shop_id() to authenticated;

-- =========================================================
-- ログイン発行(cast_login_tokens/00023と同一パターン)
-- =========================================================
create table public.staff_login_tokens (
  staff_member_id uuid primary key references public.shop_staff_members (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index idx_staff_login_tokens_shop_id on public.staff_login_tokens (shop_id);

alter table public.staff_login_tokens enable row level security;

create policy "shop admin read own staff login tokens"
  on public.staff_login_tokens for select
  to authenticated
  using (shop_id in (select public.current_shop_ids()) or public.is_platform_admin());

create or replace function public.create_staff_login_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff_login_tokens (staff_member_id, shop_id)
  values (new.id, new.shop_id)
  on conflict (staff_member_id) do nothing;
  return new;
end;
$$;

create trigger trg_shop_staff_members_create_login_token
  after insert on public.shop_staff_members
  for each row
  execute function public.create_staff_login_token();

create or replace function public.regenerate_staff_login_token(p_staff_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_new_token uuid := gen_random_uuid();
begin
  select shop_id into v_shop_id from public.shop_staff_members where id = p_staff_member_id;
  if v_shop_id is null then
    raise exception 'staff member not found';
  end if;
  if v_shop_id not in (select public.current_shop_ids()) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  update public.staff_login_tokens set token = v_new_token where staff_member_id = p_staff_member_id;
  return v_new_token;
end;
$$;

revoke all on function public.regenerate_staff_login_token(uuid) from public;
revoke execute on function public.regenerate_staff_login_token(uuid) from anon;
grant execute on function public.regenerate_staff_login_token(uuid) to authenticated;

-- 招待発行(create_cast_invite/00015と同一パターン。Admin APIが無い環境のため
-- auth.usersへ直接SECURITY DEFINER関数からINSERTする)。
create or replace function public.create_staff_invite(p_staff_member_id uuid)
returns table(login_email text, initial_password text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
  v_email text;
  v_password text;
  v_encrypted text;
begin
  select shop_id, user_id into v_shop_id, v_user_id from public.shop_staff_members where id = p_staff_member_id;

  if v_shop_id is null then
    raise exception 'staff member not found';
  end if;

  if v_shop_id not in (select public.current_shop_ids()) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  v_encrypted := crypt(v_password, gen_salt('bf'));

  if v_user_id is null then
    v_email := 'staff-' || replace(p_staff_member_id::text, '-', '') || '@staff.modella.local';
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, v_encrypted,
      now(), '', '',
      '', '',
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at
    ) values (
      gen_random_uuid(), v_user_id, v_user_id::text, 'email',
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      now(), now(), now()
    );

    update public.shop_staff_members set user_id = v_user_id where id = p_staff_member_id;
  else
    select email into v_email from auth.users where id = v_user_id;
    update auth.users set encrypted_password = v_encrypted, updated_at = now() where id = v_user_id;
  end if;

  return query select v_email, v_password;
end;
$$;

revoke all on function public.create_staff_invite(uuid) from public;
revoke execute on function public.create_staff_invite(uuid) from anon;
grant execute on function public.create_staff_invite(uuid) to authenticated;

-- マジックリンクの再訪問のたびにワンタイムパスワードを発行し、クライアントでsignInWithPasswordする
-- (redeem_cast_login_token/00023と同一パターン)。
create or replace function public.redeem_staff_login_token(p_token uuid)
returns table(login_email text, one_time_password text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_staff_member_id uuid;
  v_user_id uuid;
  v_email text;
  v_password text;
  v_encrypted text;
begin
  select staff_member_id into v_staff_member_id from public.staff_login_tokens where token = p_token;
  if v_staff_member_id is null then
    raise exception 'invalid token';
  end if;

  select user_id into v_user_id from public.shop_staff_members where id = v_staff_member_id;
  if v_user_id is null then
    raise exception 'login not provisioned for this staff member yet';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  v_encrypted := crypt(v_password, gen_salt('bf'));
  update auth.users set encrypted_password = v_encrypted, updated_at = now() where id = v_user_id;

  return query select v_email, v_password;
end;
$$;

revoke all on function public.redeem_staff_login_token(uuid) from public;
grant execute on function public.redeem_staff_login_token(uuid) to anon, authenticated;

-- =========================================================
-- プロフィール編集(update_own_cast_profile/00016-17と同一パターン)
-- =========================================================
create or replace function public.update_own_staff_profile(
  p_name text,
  p_bio text,
  p_avatar_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shop_staff_members
  set
    name = coalesce(nullif(trim(p_name), ''), name),
    bio = p_bio,
    avatar_url = coalesce(p_avatar_url, avatar_url)
  where id = public.current_staff_member_id();
end;
$$;

revoke all on function public.update_own_staff_profile(text, text, text) from public;
grant execute on function public.update_own_staff_profile(text, text, text) to authenticated;

-- =========================================================
-- reels: スタッフも投稿できるようにする(cast_idかposted_by_staff_idのどちらか一方)
-- =========================================================
alter table public.reels
  alter column cast_id drop not null,
  add column posted_by_staff_id uuid references public.shop_staff_members (id) on delete set null,
  add constraint reels_author_check check (num_nonnulls(cast_id, posted_by_staff_id) = 1);

create index idx_reels_posted_by_staff_id on public.reels (posted_by_staff_id, created_at desc);

-- shop_idの自動補完をスタッフ投稿にも対応させる。
create or replace function public.set_reel_shop_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cast_id is not null then
    select shop_id into new.shop_id from public.cast_members where id = new.cast_id;
  else
    select shop_id into new.shop_id from public.shop_staff_members where id = new.posted_by_staff_id;
  end if;
  return new;
end;
$$;

create policy "staff insert own reels"
  on public.reels for insert
  to authenticated
  with check (posted_by_staff_id = public.current_staff_member_id());

create policy "staff update own reels"
  on public.reels for update
  to authenticated
  using (posted_by_staff_id = public.current_staff_member_id())
  with check (posted_by_staff_id = public.current_staff_member_id());

create policy "staff delete own reels"
  on public.reels for delete
  to authenticated
  using (posted_by_staff_id = public.current_staff_member_id());

-- reelsストレージバケットもスタッフの自分のフォルダへの書き込みを許可。
create policy "staff upload own reel media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'reels'
    and (storage.foldername(name))[1] = public.current_staff_member_id()::text
  );

create policy "staff delete own reel media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'reels'
    and (storage.foldername(name))[1] = public.current_staff_member_id()::text
  );

-- avatarsストレージバケットもスタッフ本人のフォルダへの書き込みを許可。
create policy "staff upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_staff_member_id()::text
  );

create policy "staff update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_staff_member_id()::text
  );

create policy "staff delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_staff_member_id()::text
  );

-- =========================================================
-- shop_events: スタッフも投稿できるようにする(自分の投稿のみ編集削除)
-- =========================================================
alter table public.shop_events
  add column created_by_staff_id uuid references public.shop_staff_members (id) on delete set null;

create policy "staff read own shop events"
  on public.shop_events for select
  to authenticated
  using (shop_id = public.current_staff_shop_id());

create policy "staff insert own shop events"
  on public.shop_events for insert
  to authenticated
  with check (
    shop_id = public.current_staff_shop_id()
    and created_by_staff_id = public.current_staff_member_id()
  );

create policy "staff update own shop events"
  on public.shop_events for update
  to authenticated
  using (created_by_staff_id = public.current_staff_member_id())
  with check (created_by_staff_id = public.current_staff_member_id());

create policy "staff delete own shop events"
  on public.shop_events for delete
  to authenticated
  using (created_by_staff_id = public.current_staff_member_id());

-- shop-eventsストレージバケット(00022)もスタッフの自店舗フォルダへの書き込みを許可。
create policy "staff upload own shop event media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'shop-events'
    and (storage.foldername(name))[1] = public.current_staff_shop_id()::text
  );

create policy "staff delete own shop event media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'shop-events'
    and (storage.foldername(name))[1] = public.current_staff_shop_id()::text
  );

-- =========================================================
-- 問い合わせDM: どのスタッフが対応したか記録できるようにする
-- =========================================================
alter table public.shop_inquiry_messages
  add column staff_member_id uuid references public.shop_staff_members (id) on delete set null;

create policy "staff read own shop inquiries"
  on public.shop_inquiries for select
  to authenticated
  using (shop_id = public.current_staff_shop_id());

create policy "staff update own shop inquiries status"
  on public.shop_inquiries for update
  to authenticated
  using (shop_id = public.current_staff_shop_id())
  with check (shop_id = public.current_staff_shop_id());

create policy "staff read own shop inquiry messages"
  on public.shop_inquiry_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.shop_inquiries i
      where i.id = inquiry_id and i.shop_id = public.current_staff_shop_id()
    )
  );

create policy "staff reply to own shop inquiries"
  on public.shop_inquiry_messages for insert
  to authenticated
  with check (
    sender_type = 'shop'
    and staff_member_id = public.current_staff_member_id()
    and exists (
      select 1 from public.shop_inquiries i
      where i.id = inquiry_id and i.shop_id = public.current_staff_shop_id()
    )
  );

-- =========================================================
-- コメント機能(新規): 一般ユーザーがリールにコメントでき、スタッフが返信できる。
-- 一般ユーザーはlike/inquiryと同じ匿名viewer_id方式(ログイン不要)。
-- =========================================================
create table public.reel_comments (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels (id) on delete cascade,
  author_type text not null check (author_type in ('customer', 'staff')),
  viewer_id uuid,
  staff_member_id uuid references public.shop_staff_members (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint reel_comments_author_shape check (
    (author_type = 'customer' and viewer_id is not null and staff_member_id is null)
    or (author_type = 'staff' and staff_member_id is not null and viewer_id is null)
  )
);

create index idx_reel_comments_reel_id on public.reel_comments (reel_id, created_at);

alter table public.reel_comments enable row level security;

create policy "anon read comments of published reels"
  on public.reel_comments for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.reels r
      join public.shops s on s.id = r.shop_id
      where r.id = reel_id and r.status = 'published' and s.status = 'active'
    )
  );

create policy "anyone add customer comment"
  on public.reel_comments for insert
  to anon, authenticated
  with check (
    author_type = 'customer'
    and exists (
      select 1 from public.reels r
      join public.shops s on s.id = r.shop_id
      where r.id = reel_id and r.status = 'published' and s.status = 'active'
    )
  );

create policy "staff reply as own shop"
  on public.reel_comments for insert
  to authenticated
  with check (
    author_type = 'staff'
    and staff_member_id = public.current_staff_member_id()
    and exists (
      select 1 from public.reels r where r.id = reel_id and r.shop_id = public.current_staff_shop_id()
    )
  );

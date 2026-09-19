-- =====================================================================
-- locapass 階層型権限(RBAC)
--   super_admin > portal_admin > shop_admin > staff / cast > user
--
-- ポータルは locapass_sites を locapass_portals に改名して一本化する(コピーせず二重管理しない)。
-- 各テーブルの site_id は portal_id に改名。IDはそのまま引き継ぐので既存データ・外部キーは維持される。
-- 権限テーブル:
--   super_admin  : locapass_super_admins        (旧 locapass_root_admins)
--   portal_admin : locapass_portal_admins       (旧 locapass_site_admins)
--   shop_admin   : locapass_shop_admins         (旧 locapass_shop_members。LUXELA shop_staff 相当)
--   staff        : locapass_shop_staff_members  (新設。LUXELA shop_staff_members と同じ列)
--   cast         : locapass_cast_members        (新設。LUXELA cast_members と同じ列)
--   user         : locapass_members             (既存の一般会員)
-- 判定関数:
--   locapass_is_super_admin() / locapass_is_portal_admin(portal_id) /
--   locapass_is_shop_admin(shop_id) / locapass_is_shop_staff(shop_id) /
--   locapass_current_staff_member_id() / locapass_current_cast_id()
-- 上位の権限は下位を包含する(super_admin は全ポータルの portal_admin、portal_admin は配下全店舗の
-- shop_admin、shop_admin は自店舗の staff を兼ねる)。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ポータル(locapass_sites → locapass_portals)
-- ---------------------------------------------------------------------
alter table public.locapass_sites rename to locapass_portals;
alter sequence public.locapass_sites_id_seq rename to locapass_portals_id_seq;
alter table public.locapass_portals rename constraint locapass_sites_pkey to locapass_portals_pkey;
alter table public.locapass_portals rename constraint locapass_sites_slug_key to locapass_portals_slug_key;
alter table public.locapass_portals rename constraint locapass_sites_wp_blog_id_key to locapass_portals_wp_blog_id_key;
-- WordPressとは切り離すので、WP側のブログIDは任意にする(Next.jsから発行したポータルには無い)。
alter table public.locapass_portals alter column wp_blog_id drop not null;
alter table public.locapass_portals
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();
alter table public.locapass_portals
  add constraint locapass_portals_status_check check (status in ('active', 'suspended'));

-- ---------------------------------------------------------------------
-- 2. site_id → portal_id
-- ---------------------------------------------------------------------
alter table public.locapass_shops rename column site_id to portal_id;
alter table public.locapass_shops rename constraint locapass_shops_site_id_fkey to locapass_shops_portal_id_fkey;
alter table public.locapass_shops rename constraint locapass_shops_site_id_slug_key to locapass_shops_portal_id_slug_key;

alter table public.locapass_reels rename column site_id to portal_id;
alter table public.locapass_reels rename constraint locapass_reels_site_id_fkey to locapass_reels_portal_id_fkey;
alter table public.locapass_reels rename constraint locapass_reels_site_id_wp_post_id_key to locapass_reels_portal_id_wp_post_id_key;

alter table public.locapass_venues rename column site_id to portal_id;
alter table public.locapass_venues rename constraint locapass_venues_site_id_fkey to locapass_venues_portal_id_fkey;
alter table public.locapass_vehicles rename column site_id to portal_id;
alter table public.locapass_vehicles rename constraint locapass_vehicles_site_id_fkey to locapass_vehicles_portal_id_fkey;
alter table public.locapass_ugc_photos rename column site_id to portal_id;
alter table public.locapass_ugc_photos rename constraint locapass_ugc_photos_site_id_fkey to locapass_ugc_photos_portal_id_fkey;
alter table public.locapass_member_favorite_shops rename column site_id to portal_id;
alter table public.locapass_member_favorite_shops rename constraint locapass_member_favorite_shops_site_id_fkey to locapass_member_favorite_shops_portal_id_fkey;

-- ---------------------------------------------------------------------
-- 3. 権限テーブル
-- ---------------------------------------------------------------------
alter table public.locapass_root_admins rename to locapass_super_admins;
alter table public.locapass_super_admins rename constraint locapass_root_admins_pkey to locapass_super_admins_pkey;
alter table public.locapass_super_admins rename constraint locapass_root_admins_user_id_fkey to locapass_super_admins_user_id_fkey;

alter table public.locapass_site_admins rename to locapass_portal_admins;
alter table public.locapass_portal_admins rename column site_id to portal_id;
alter table public.locapass_portal_admins rename constraint locapass_site_admins_pkey to locapass_portal_admins_pkey;
alter table public.locapass_portal_admins rename constraint locapass_site_admins_site_id_fkey to locapass_portal_admins_portal_id_fkey;
alter table public.locapass_portal_admins rename constraint locapass_site_admins_user_id_fkey to locapass_portal_admins_user_id_fkey;

-- shop_admin(店舗オーナー・店長のログインアカウント)。LUXELA shop_staff と同じく
-- 行ごとのid・発行したログインIDを持つ。staffは別テーブルに分けるのでroleは廃止(既存1件はowner)。
alter table public.locapass_shop_members rename to locapass_shop_admins;
alter table public.locapass_shop_admins rename constraint locapass_shop_members_pkey to locapass_shop_admins_pkey;
alter table public.locapass_shop_admins rename constraint locapass_shop_members_shop_id_fkey to locapass_shop_admins_shop_id_fkey;
alter table public.locapass_shop_admins rename constraint locapass_shop_members_user_id_fkey to locapass_shop_admins_user_id_fkey;
alter table public.locapass_shop_admins
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists login_email text;
alter table public.locapass_shop_admins add constraint locapass_shop_admins_id_key unique (id);
update public.locapass_shop_admins a set login_email = u.email from auth.users u where u.id = a.user_id and a.login_email is null;
alter table public.locapass_shop_admins drop constraint locapass_shop_members_role_check;
alter table public.locapass_shop_admins drop column role;

-- staff(LUXELA shop_staff_members と同じ列)
create table public.locapass_shop_staff_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  name text not null,
  avatar_url text,
  bio text,
  user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index locapass_shop_staff_members_shop_id_idx on public.locapass_shop_staff_members (shop_id);

create table public.locapass_staff_login_tokens (
  staff_member_id uuid primary key references public.locapass_shop_staff_members(id) on delete cascade,
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- cast(LUXELA cast_members と同じ列)
create or replace function public.locapass_generate_cast_code()
returns text language plpgsql set search_path = public as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.locapass_cast_members where cast_code = code);
  end loop;
  return code;
end;
$$;

create table public.locapass_cast_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  name text not null,
  age integer,
  sizes jsonb,
  pr_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  user_id uuid unique references auth.users(id) on delete set null,
  avatar_url text,
  legal_name text,
  legal_name_kana text,
  birth_date date,
  address text,
  phone text,
  id_check_match_level text,
  id_check_hit_count integer,
  id_checked_at timestamptz,
  id_document_path text,
  cast_code text not null unique,
  updated_at timestamptz not null default now()
);
create index locapass_cast_members_shop_id_idx on public.locapass_cast_members (shop_id);

create table public.locapass_cast_login_tokens (
  cast_id uuid primary key references public.locapass_cast_members(id) on delete cascade,
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create or replace function public.locapass_cast_members_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.cast_code is null then
    new.cast_code := public.locapass_generate_cast_code();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger locapass_cast_members_before_write
  before insert or update on public.locapass_cast_members
  for each row execute function public.locapass_cast_members_before_write();

create or replace function public.locapass_create_login_token_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'locapass_cast_members' then
    insert into public.locapass_cast_login_tokens (cast_id, shop_id) values (new.id, new.shop_id)
      on conflict (cast_id) do nothing;
  else
    insert into public.locapass_staff_login_tokens (staff_member_id, shop_id) values (new.id, new.shop_id)
      on conflict (staff_member_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger locapass_cast_members_create_login_token
  after insert on public.locapass_cast_members
  for each row execute function public.locapass_create_login_token_row();
create trigger locapass_shop_staff_members_create_login_token
  after insert on public.locapass_shop_staff_members
  for each row execute function public.locapass_create_login_token_row();

-- ---------------------------------------------------------------------
-- 4. 権限判定関数
-- ---------------------------------------------------------------------
create or replace function public.locapass_is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from locapass_super_admins where user_id = auth.uid());
$$;

create or replace function public.locapass_is_portal_admin(p_portal_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select locapass_is_super_admin()
      or exists (select 1 from locapass_portal_admins where portal_id = p_portal_id and user_id = auth.uid());
$$;

create or replace function public.locapass_is_shop_admin(p_shop_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from locapass_shops s
    where s.id = p_shop_id
      and (locapass_is_portal_admin(s.portal_id)
           or exists (select 1 from locapass_shop_admins a where a.shop_id = s.id and a.user_id = auth.uid()))
  );
$$;

create or replace function public.locapass_is_shop_staff(p_shop_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select locapass_is_shop_admin(p_shop_id)
      or exists (select 1 from locapass_shop_staff_members m where m.shop_id = p_shop_id and m.user_id = auth.uid());
$$;

create or replace function public.locapass_current_staff_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from locapass_shop_staff_members where user_id = auth.uid() limit 1;
$$;

create or replace function public.locapass_current_cast_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from locapass_cast_members where user_id = auth.uid() limit 1;
$$;

-- ログイン中ユーザーの権限一覧(画面の出し分け用)。
create or replace function public.locapass_my_roles()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'super_admin', locapass_is_super_admin(),
    'portal_ids', coalesce((select jsonb_agg(portal_id) from locapass_portal_admins where user_id = auth.uid()), '[]'::jsonb),
    'shop_admin_shop_ids', coalesce((select jsonb_agg(shop_id) from locapass_shop_admins where user_id = auth.uid()), '[]'::jsonb),
    'staff', (select jsonb_build_object('staff_member_id', id, 'shop_id', shop_id) from locapass_shop_staff_members where user_id = auth.uid() limit 1),
    'cast', (select jsonb_build_object('cast_id', id, 'shop_id', shop_id) from locapass_cast_members where user_id = auth.uid() limit 1),
    'member', exists (select 1 from locapass_members where id = auth.uid())
  );
$$;

-- 全ユーザーの権限を1つの形で見るためのビュー(呼び出し元のRLSで絞られる)。
create view public.locapass_user_roles with (security_invoker = true) as
  select user_id, 'super_admin'::text as role, null::bigint as portal_id, null::uuid as shop_id from public.locapass_super_admins
  union all
  select user_id, 'portal_admin', portal_id, null from public.locapass_portal_admins
  union all
  select a.user_id, 'shop_admin', s.portal_id, a.shop_id from public.locapass_shop_admins a join public.locapass_shops s on s.id = a.shop_id
  union all
  select m.user_id, 'staff', s.portal_id, m.shop_id from public.locapass_shop_staff_members m join public.locapass_shops s on s.id = m.shop_id where m.user_id is not null
  union all
  select c.user_id, 'cast', s.portal_id, c.shop_id from public.locapass_cast_members c join public.locapass_shops s on s.id = c.shop_id where c.user_id is not null
  union all
  select id, 'user', null, null from public.locapass_members;

-- ---------------------------------------------------------------------
-- 5. 既存ポリシーを新しい判定関数に付け替え(その後に旧関数を削除)
-- ---------------------------------------------------------------------
alter policy "public read locapass_sites" on public.locapass_portals rename to "portals public read";
alter policy "sites write by root" on public.locapass_portals rename to "portals write by super admin";
alter policy "portals write by super admin" on public.locapass_portals
  using (locapass_is_super_admin()) with check (locapass_is_super_admin());
create policy "portals update by portal admin" on public.locapass_portals for update
  using (locapass_is_portal_admin(id)) with check (locapass_is_portal_admin(id));

alter policy "root admins read" on public.locapass_super_admins rename to "super admins read";
alter policy "super admins read" on public.locapass_super_admins
  using ((user_id = auth.uid()) or locapass_is_super_admin());

alter policy "site admins read" on public.locapass_portal_admins rename to "portal admins read";
alter policy "portal admins read" on public.locapass_portal_admins
  using ((user_id = auth.uid()) or locapass_is_portal_admin(portal_id));
alter policy "site admins write by root" on public.locapass_portal_admins rename to "portal admins write by super admin";
alter policy "portal admins write by super admin" on public.locapass_portal_admins
  using (locapass_is_super_admin()) with check (locapass_is_super_admin());

alter policy "shops public read active" on public.locapass_shops
  using ((status = 'active') or locapass_is_shop_staff(id));
alter policy "shops insert by site admin" on public.locapass_shops rename to "shops insert by portal admin";
alter policy "shops insert by portal admin" on public.locapass_shops
  with check (locapass_is_portal_admin(portal_id));
alter policy "shops update by owner" on public.locapass_shops rename to "shops update by shop admin";
alter policy "shops update by shop admin" on public.locapass_shops
  using (locapass_is_shop_admin(id)) with check (locapass_is_shop_admin(id));
alter policy "shops delete by site admin" on public.locapass_shops rename to "shops delete by portal admin";
alter policy "shops delete by portal admin" on public.locapass_shops
  using (locapass_is_portal_admin(portal_id));

-- shop_admin の発行・削除は portal_admin の権限(仕様: ポータル管理者が店舗発行時に付与する)。
alter policy "shop members read" on public.locapass_shop_admins rename to "shop admins read";
alter policy "shop admins read" on public.locapass_shop_admins
  using ((user_id = auth.uid()) or locapass_is_shop_admin(shop_id));
alter policy "shop members write by owner" on public.locapass_shop_admins rename to "shop admins write by portal admin";
alter policy "shop admins write by portal admin" on public.locapass_shop_admins
  using (locapass_is_portal_admin((select s.portal_id from public.locapass_shops s where s.id = shop_id)))
  with check (locapass_is_portal_admin((select s.portal_id from public.locapass_shops s where s.id = shop_id)));

alter policy "reels manager read" on public.locapass_reels
  using ((shop_id is not null) and locapass_is_shop_staff(shop_id));
alter policy "reels manager insert" on public.locapass_reels
  with check ((shop_id is not null) and locapass_is_shop_staff(shop_id));
alter policy "reels manager update" on public.locapass_reels
  using ((shop_id is not null) and locapass_is_shop_staff(shop_id))
  with check ((shop_id is not null) and locapass_is_shop_staff(shop_id));
alter policy "reels manager delete" on public.locapass_reels
  using ((shop_id is not null) and locapass_is_shop_staff(shop_id));

alter policy "checkins read by owner or shop manager" on public.locapass_checkins
  using ((member_id = auth.uid()) or locapass_is_shop_staff(shop_id));

alter policy "ugc photos public read published" on public.locapass_ugc_photos
  using ((status = 'published') or (member_id = auth.uid()) or locapass_is_portal_admin(portal_id));
alter policy "ugc photos update by owner or site admin" on public.locapass_ugc_photos rename to "ugc photos update by owner or portal admin";
alter policy "ugc photos update by owner or portal admin" on public.locapass_ugc_photos
  using ((member_id = auth.uid()) or locapass_is_portal_admin(portal_id))
  with check ((member_id = auth.uid()) or locapass_is_portal_admin(portal_id));
alter policy "ugc photos delete by owner or site admin" on public.locapass_ugc_photos rename to "ugc photos delete by owner or portal admin";
alter policy "ugc photos delete by owner or portal admin" on public.locapass_ugc_photos
  using ((member_id = auth.uid()) or locapass_is_portal_admin(portal_id));

alter policy "locapass reels media upload by shop managers" on storage.objects
  with check ((bucket_id = 'locapass-reels') and locapass_is_shop_staff(((storage.foldername(name))[1])::uuid));
alter policy "locapass reels media delete by shop managers" on storage.objects
  using ((bucket_id = 'locapass-reels') and locapass_is_shop_staff(((storage.foldername(name))[1])::uuid));

-- トリガー関数(列名・判定関数の変更に追従)
create or replace function public.locapass_shops_guard_privileged()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.plan is distinct from old.plan
          or new.status is distinct from old.status
          or new.portal_id is distinct from old.portal_id)
     and not locapass_is_portal_admin(old.portal_id) then
    raise exception 'plan/status/portal_id can only be changed by portal admins';
  end if;
  if new.portal_id is distinct from old.portal_id and auth.uid() is not null and not locapass_is_portal_admin(new.portal_id) then
    raise exception 'not an admin of the destination portal';
  end if;
  return new;
end;
$$;

create or replace function public.locapass_reels_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.shop_id is null and new.author_url is not null then
    select id into new.shop_id from locapass_shops where wp_author_url = new.author_url;
  end if;
  if new.shop_id is not null then
    select portal_id into new.portal_id from locapass_shops where id = new.shop_id;
  end if;
  if new.published_at is null then
    new.published_at := coalesce(new.wp_created_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop function public.locapass_add_site_admin(bigint, text);
drop function public.locapass_add_shop_member(uuid, text, text);
drop function public.locapass_list_site_admins(bigint);
drop function public.locapass_list_shop_members(uuid);
drop function public.locapass_list_site_shop_owners(bigint);
drop function public.locapass_can_manage_shop(uuid);
drop function public.locapass_is_shop_owner(uuid);
drop function public.locapass_is_site_admin(bigint);
drop function public.locapass_is_root_admin();

-- ---------------------------------------------------------------------
-- 6. staff / cast のRLS
--    cast_members は本名・住所・電話・生年月日・身分証を含むため、表側には公開用ビューだけを出す
--    (LUXELA cast_members は anon に全列を読ませているが、その形は複製しない)。
-- ---------------------------------------------------------------------
alter table public.locapass_shop_staff_members enable row level security;
alter table public.locapass_staff_login_tokens enable row level security;
alter table public.locapass_cast_members enable row level security;
alter table public.locapass_cast_login_tokens enable row level security;

create policy "staff members public read of active shops" on public.locapass_shop_staff_members for select
  to anon, authenticated
  using (exists (select 1 from public.locapass_shops s where s.id = shop_id and s.status = 'active'));
create policy "staff members read own shop" on public.locapass_shop_staff_members for select
  using (locapass_is_shop_staff(shop_id));
create policy "staff members manage by shop admin" on public.locapass_shop_staff_members for all
  using (locapass_is_shop_admin(shop_id)) with check (locapass_is_shop_admin(shop_id));

create policy "staff login tokens read by shop admin" on public.locapass_staff_login_tokens for select
  using (locapass_is_shop_admin(shop_id));

create policy "cast members read by shop staff" on public.locapass_cast_members for select
  using (locapass_is_shop_staff(shop_id));
create policy "cast members read own row" on public.locapass_cast_members for select
  using (user_id = auth.uid());
create policy "cast members manage by shop admin" on public.locapass_cast_members for all
  using (locapass_is_shop_admin(shop_id)) with check (locapass_is_shop_admin(shop_id));

create policy "cast login tokens read by shop admin" on public.locapass_cast_login_tokens for select
  using (locapass_is_shop_admin(shop_id));

-- 表側で使う公開項目だけのビュー(公開中の店舗のキャストのみ)。
create view public.locapass_public_casts as
  select c.id, c.shop_id, c.name, c.age, c.sizes, c.pr_text, c.avatar_url, c.cast_code, c.created_at, c.updated_at
  from public.locapass_cast_members c
  join public.locapass_shops s on s.id = c.shop_id
  where s.status = 'active';
grant select on public.locapass_public_casts to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. 発行・付与・削除のチェーン(RPC)
-- ---------------------------------------------------------------------
-- 内部用: メール+パスワードのログインアカウントを作る。既に同じメールのユーザーがいればそのidを返す。
create or replace function public.locapass__ensure_auth_user(p_email text, p_password text)
returns table(user_id uuid, created boolean)
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(p_email);
  if v_user_id is not null then
    return query select v_user_id, false;
    return;
  end if;

  v_user_id := gen_random_uuid();
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    lower(p_email), crypt(p_password, gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text, 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', lower(p_email)), now(), now(), now()
  );
  return query select v_user_id, true;
end;
$$;
revoke all on function public.locapass__ensure_auth_user(text, text) from public, anon, authenticated;

create or replace function public.locapass__new_password()
returns text language sql volatile set search_path = public as $$
  select substr(md5(gen_random_uuid()::text), 1, 10);
$$;

-- super_admin: ポータル新規発行
create or replace function public.locapass_create_portal(
  p_slug text, p_name text, p_home_url text default null, p_tagline text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if not locapass_is_super_admin() then raise exception 'forbidden'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'ポータル名は必須です'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,40}$' then
    raise exception 'スラッグは半角英小文字・数字・ハイフンで2〜41文字にしてください';
  end if;
  insert into locapass_portals (slug, name, home_url, tagline)
  values (v_slug, trim(p_name), nullif(trim(coalesce(p_home_url, '')), ''), nullif(trim(coalesce(p_tagline, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- super_admin: portal_admin の招待・付与(メールが未登録ならアカウントを作り初期パスワードを返す)
create or replace function public.locapass_grant_portal_admin(p_portal_id bigint, p_email text)
returns table(login_email text, initial_password text)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_password text := locapass__new_password();
  v_user_id uuid;
  v_created boolean;
begin
  if not locapass_is_super_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from locapass_portals where id = p_portal_id) then raise exception 'portal not found'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'メールアドレスの形式が正しくありません'; end if;

  select u.user_id, u.created into v_user_id, v_created from locapass__ensure_auth_user(v_email, v_password) u;
  insert into locapass_portal_admins (portal_id, user_id) values (p_portal_id, v_user_id) on conflict do nothing;
  return query select v_email, case when v_created then v_password else null end;
end;
$$;

create or replace function public.locapass_revoke_portal_admin(p_portal_id bigint, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not locapass_is_super_admin() then raise exception 'forbidden'; end if;
  delete from locapass_portal_admins where portal_id = p_portal_id and user_id = p_user_id;
end;
$$;

create or replace function public.locapass_list_portal_admins(p_portal_id bigint)
returns table(user_id uuid, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not locapass_is_portal_admin(p_portal_id) then raise exception 'forbidden'; end if;
  return query select a.user_id, u.email::text, a.created_at
    from locapass_portal_admins a join auth.users u on u.id = a.user_id
    where a.portal_id = p_portal_id order by a.created_at;
end;
$$;

-- portal_admin: 配下に店舗を新規発行
create or replace function public.locapass_create_shop(
  p_portal_id bigint, p_name text, p_category text default null,
  p_address text default null, p_tel text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not locapass_is_portal_admin(p_portal_id) then raise exception 'forbidden'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception '店舗名は必須です'; end if;
  insert into locapass_shops (portal_id, slug, name, category, address, tel, status)
  values (
    p_portal_id,
    substr(md5(gen_random_uuid()::text), 1, 10),
    trim(p_name),
    nullif(trim(coalesce(p_category, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_tel, '')), ''),
    'draft'
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- portal_admin: shop_admin の招待・付与。メール未指定なら店舗コードからログインIDを作る(LUXELA同様)。
create or replace function public.locapass_grant_shop_admin(
  p_shop_id uuid, p_email text default null, p_password text default null
) returns table(login_email text, initial_password text)
language plpgsql security definer set search_path = public as $$
declare
  v_portal_id bigint;
  v_shop_code text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_password text := nullif(trim(coalesce(p_password, '')), '');
  v_base text;
  v_suffix int := 1;
  v_user_id uuid;
  v_created boolean;
begin
  select portal_id, shop_code into v_portal_id, v_shop_code from locapass_shops where id = p_shop_id;
  if v_portal_id is null then raise exception 'shop not found'; end if;
  if not locapass_is_portal_admin(v_portal_id) then raise exception 'forbidden'; end if;

  if v_email = '' then
    v_base := lower(v_shop_code);
    v_email := v_base || '@shop.locapass.local';
    while exists (select 1 from auth.users where email = v_email) loop
      v_suffix := v_suffix + 1;
      v_email := v_base || '-' || v_suffix || '@shop.locapass.local';
      exit when v_suffix > 50;
    end loop;
  elsif v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'メールアドレスの形式が正しくありません';
  end if;

  if v_password is null then
    v_password := locapass__new_password();
  elsif length(v_password) < 6 then
    raise exception 'パスワードは6文字以上にしてください';
  end if;

  select u.user_id, u.created into v_user_id, v_created from locapass__ensure_auth_user(v_email, v_password) u;
  insert into locapass_shop_admins (shop_id, user_id, login_email) values (p_shop_id, v_user_id, v_email)
    on conflict (shop_id, user_id) do nothing;
  return query select v_email, case when v_created then v_password else null end;
end;
$$;

create or replace function public.locapass_revoke_shop_admin(p_shop_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_shop_id uuid;
begin
  select shop_id into v_shop_id from locapass_shop_admins where id = p_shop_admin_id;
  if v_shop_id is null then raise exception 'not found'; end if;
  if not locapass_is_portal_admin((select portal_id from locapass_shops where id = v_shop_id)) then
    raise exception 'forbidden';
  end if;
  delete from locapass_shop_admins where id = p_shop_admin_id;
end;
$$;

-- portal_admin: 発行済み shop_admin のパスワード再発行。
-- 実在メールの個人アカウントを上書きしないよう、発行用ダミーID(@shop.locapass.local)に限る。
create or replace function public.locapass_reset_shop_admin_password(p_shop_admin_id uuid, p_password text default null)
returns table(login_email text, new_password text)
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
  v_email text;
  v_password text := nullif(trim(coalesce(p_password, '')), '');
begin
  select shop_id, user_id, login_email into v_shop_id, v_user_id, v_email from locapass_shop_admins where id = p_shop_admin_id;
  if v_user_id is null then raise exception 'login not found'; end if;
  if not locapass_is_portal_admin((select portal_id from locapass_shops where id = v_shop_id)) then
    raise exception 'forbidden';
  end if;
  if v_email is null or v_email not like '%@shop.locapass.local' then
    raise exception '個人のメールアドレスのアカウントはここでは再発行できません(本人がパスワード再設定してください)';
  end if;
  if v_password is null then
    v_password := locapass__new_password();
  elsif length(v_password) < 6 then
    raise exception 'パスワードは6文字以上にしてください';
  end if;
  update auth.users set encrypted_password = crypt(v_password, gen_salt('bf')), updated_at = now() where id = v_user_id;
  return query select v_email, v_password;
end;
$$;

-- portal_admin: 配下店舗ごとの shop_admin 一覧
create or replace function public.locapass_list_portal_shop_admins(p_portal_id bigint)
returns table(shop_id uuid, shop_admin_id uuid, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not locapass_is_portal_admin(p_portal_id) then raise exception 'forbidden'; end if;
  return query
    select a.shop_id, a.id, coalesce(a.login_email, u.email::text), a.created_at
    from locapass_shop_admins a
    join locapass_shops s on s.id = a.shop_id
    join auth.users u on u.id = a.user_id
    where s.portal_id = p_portal_id
    order by a.created_at;
end;
$$;

-- shop_admin: staff / cast のログイン発行(LUXELA create_staff_invite / create_cast_invite と同じ動き)
create or replace function public.locapass_create_staff_invite(p_staff_member_id uuid)
returns table(login_email text, initial_password text)
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
  v_email text;
  v_password text := locapass__new_password();
begin
  select shop_id, user_id into v_shop_id, v_user_id from locapass_shop_staff_members where id = p_staff_member_id;
  if v_shop_id is null then raise exception 'staff member not found'; end if;
  if not locapass_is_shop_admin(v_shop_id) then raise exception 'forbidden'; end if;

  if v_user_id is null then
    v_email := 'staff-' || replace(p_staff_member_id::text, '-', '') || '@staff.locapass.local';
    select u.user_id into v_user_id from locapass__ensure_auth_user(v_email, v_password) u;
    update locapass_shop_staff_members set user_id = v_user_id where id = p_staff_member_id;
  else
    select email into v_email from auth.users where id = v_user_id;
    update auth.users set encrypted_password = crypt(v_password, gen_salt('bf')), updated_at = now() where id = v_user_id;
  end if;
  return query select v_email, v_password;
end;
$$;

create or replace function public.locapass_create_cast_invite(p_cast_id uuid)
returns table(login_email text, initial_password text)
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
  v_email text;
  v_password text := locapass__new_password();
begin
  select shop_id, user_id into v_shop_id, v_user_id from locapass_cast_members where id = p_cast_id;
  if v_shop_id is null then raise exception 'cast not found'; end if;
  if not locapass_is_shop_admin(v_shop_id) then raise exception 'forbidden'; end if;

  if v_user_id is null then
    v_email := 'cast-' || replace(p_cast_id::text, '-', '') || '@cast.locapass.local';
    select u.user_id into v_user_id from locapass__ensure_auth_user(v_email, v_password) u;
    update locapass_cast_members set user_id = v_user_id where id = p_cast_id;
  else
    select email into v_email from auth.users where id = v_user_id;
    update auth.users set encrypted_password = crypt(v_password, gen_salt('bf')), updated_at = now() where id = v_user_id;
  end if;
  return query select v_email, v_password;
end;
$$;

create or replace function public.locapass_regenerate_staff_login_token(p_staff_member_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_shop_id uuid;
  v_token uuid := gen_random_uuid();
begin
  select shop_id into v_shop_id from locapass_shop_staff_members where id = p_staff_member_id;
  if v_shop_id is null then raise exception 'staff member not found'; end if;
  if not locapass_is_shop_admin(v_shop_id) then raise exception 'forbidden'; end if;
  update locapass_staff_login_tokens set token = v_token where staff_member_id = p_staff_member_id;
  return v_token;
end;
$$;

create or replace function public.locapass_regenerate_cast_login_token(p_cast_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_shop_id uuid;
  v_token uuid := gen_random_uuid();
begin
  select shop_id into v_shop_id from locapass_cast_members where id = p_cast_id;
  if v_shop_id is null then raise exception 'cast not found'; end if;
  if not locapass_is_shop_admin(v_shop_id) then raise exception 'forbidden'; end if;
  update locapass_cast_login_tokens set token = v_token where cast_id = p_cast_id;
  return v_token;
end;
$$;

-- マイページ用リンクからのログイン(LUXELA redeem_*_login_token と同じ。リンクを開くたびにワンタイムPWを発行)
create or replace function public.locapass_redeem_staff_login_token(p_token uuid)
returns table(login_email text, one_time_password text)
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_user_id uuid;
  v_email text;
  v_password text := locapass__new_password();
begin
  select m.user_id into v_user_id
  from locapass_staff_login_tokens t join locapass_shop_staff_members m on m.id = t.staff_member_id
  where t.token = p_token;
  if v_user_id is null then raise exception 'invalid token'; end if;
  select email into v_email from auth.users where id = v_user_id;
  update auth.users set encrypted_password = crypt(v_password, gen_salt('bf')), updated_at = now() where id = v_user_id;
  return query select v_email, v_password;
end;
$$;

create or replace function public.locapass_redeem_cast_login_token(p_token uuid)
returns table(login_email text, one_time_password text)
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_user_id uuid;
  v_email text;
  v_password text := locapass__new_password();
begin
  select c.user_id into v_user_id
  from locapass_cast_login_tokens t join locapass_cast_members c on c.id = t.cast_id
  where t.token = p_token;
  if v_user_id is null then raise exception 'invalid token'; end if;
  select email into v_email from auth.users where id = v_user_id;
  update auth.users set encrypted_password = crypt(v_password, gen_salt('bf')), updated_at = now() where id = v_user_id;
  return query select v_email, v_password;
end;
$$;

revoke execute on function public.locapass__new_password() from public, anon, authenticated;

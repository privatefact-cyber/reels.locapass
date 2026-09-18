-- 【運営者(開発者)向け管理コンソール】
-- これまで新規店舗はセッション内で直接SQL INSERTしていただけで、実運用で使える
-- 「店舗発行」画面が存在しなかった(未実装)。/admin 以下に運営者専用ダッシュボードを
-- 新設し、店舗の新規発行(契約プラン・実メールアドレスでのログイン発行込み)・
-- 有効/無効切り替え・追加ログイン発行をここに集約する。
--
-- platform_admins テーブル・is_platform_admin() 関数自体は00001から存在していたが、
-- それを使う画面もRLSポリシーも一切無かった(与信照会の横断参照用途のみ想定されていた)。

-- ---- shops: 契約プランを新設。店舗一覧に表示するための項目。 ----
alter table public.shops add column plan text not null default 'standard'
  check (plan in ('trial', 'standard', 'premium', 'enterprise'));

-- ---- shop_staff: 発行したログインのメールアドレスを管理コンソールで確認できるよう保持する。
-- auth.usersはPostgRESTから直接参照できないため、発行時に平文メールを複製しておく
-- (パスワードは複製しない。パスワードは発行直後の画面表示のみで、以後は運営者も再確認不可)。
alter table public.shop_staff add column login_email text;

-- ---- shops: 運営者は状態に関わらず全店舗を閲覧・状態変更できる ----
create policy "platform admin read all shops"
  on public.shops for select
  to authenticated
  using (public.is_platform_admin());

create policy "platform admin update all shops"
  on public.shops for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---- shop_staff: 運営者は全店舗のログインアカウント一覧を閲覧できる ----
create policy "platform admin read all shop staff"
  on public.shop_staff for select
  to authenticated
  using (public.is_platform_admin());

-- =========================================================
-- 内部ヘルパー: 指定店舗にログインアカウントを1件作成する。
-- p_email/p_password を省略した場合はダミーメール/ランダムパスワードを生成する。
-- Supabase Admin API(service_roleキー)がこのアプリのフロント環境に無いため、
-- auth.usersへ直接SECURITY DEFINER関数からINSERTする(cast/staff招待と同一パターン)。
-- =========================================================
create or replace function public.admin_create_login_for_shop(
  p_shop_id uuid,
  p_email text default null,
  p_password text default null
)
returns table(login_email text, initial_password text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_email text;
  v_password text;
  v_encrypted text;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if not exists (select 1 from public.shops where id = p_shop_id) then
    raise exception 'shop not found';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    v_email := 'shop-' || replace(p_shop_id::text, '-', '') || '-' || substr(md5(gen_random_uuid()::text), 1, 6) || '@shop.modella.local';
  elsif v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'メールアドレスの形式が正しくありません';
  end if;

  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'このメールアドレスは既に使用されています';
  end if;

  v_password := nullif(trim(coalesce(p_password, '')), '');
  if v_password is null then
    v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  elsif length(v_password) < 6 then
    raise exception 'パスワードは6文字以上にしてください';
  end if;

  v_encrypted := crypt(v_password, gen_salt('bf'));
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

  insert into public.shop_staff (shop_id, user_id, role, login_email)
  values (p_shop_id, v_user_id, 'owner', v_email);

  return query select v_email, v_password;
end;
$$;

revoke all on function public.admin_create_login_for_shop(uuid, text, text) from public;
revoke execute on function public.admin_create_login_for_shop(uuid, text, text) from anon;
grant execute on function public.admin_create_login_for_shop(uuid, text, text) to authenticated;

-- 既存の管理画面(店舗発行後の「追加ログイン発行」ボタン)から呼ぶ薄いラッパー。
create or replace function public.admin_issue_shop_login(p_shop_id uuid)
returns table(login_email text, initial_password text)
language sql
security definer
set search_path = public
as $$
  select * from public.admin_create_login_for_shop(p_shop_id, null, null);
$$;

revoke all on function public.admin_issue_shop_login(uuid) from public;
revoke execute on function public.admin_issue_shop_login(uuid) from anon;
grant execute on function public.admin_issue_shop_login(uuid) to authenticated;

-- =========================================================
-- 店舗発行(店舗レコード作成 + 実メールアドレスでのオーナーログイン発行を1回で行う)。
-- 運営者のみ実行可能。
-- =========================================================
create or replace function public.admin_provision_shop(
  p_name text,
  p_area text,
  p_genre text,
  p_plan text,
  p_owner_email text,
  p_owner_password text default null
)
returns table(shop_id uuid, login_email text, initial_password text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_plan text;
  v_login record;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'shop name is required';
  end if;

  v_plan := nullif(trim(coalesce(p_plan, '')), '');
  if v_plan is null then
    v_plan := 'standard';
  end if;
  if v_plan not in ('trial', 'standard', 'premium', 'enterprise') then
    raise exception 'invalid plan';
  end if;

  insert into public.shops (name, area, genre, plan, status)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_area, '')), ''),
    nullif(trim(coalesce(p_genre, '')), ''),
    v_plan,
    'active'
  )
  returning id into v_shop_id;

  select * into v_login from public.admin_create_login_for_shop(v_shop_id, p_owner_email, p_owner_password);

  return query select v_shop_id, v_login.login_email, v_login.initial_password;
end;
$$;

revoke all on function public.admin_provision_shop(text, text, text, text, text, text) from public;
revoke execute on function public.admin_provision_shop(text, text, text, text, text, text) from anon;
grant execute on function public.admin_provision_shop(text, text, text, text, text, text) to authenticated;

-- =========================================================
-- 運営者アカウント(ユーザー本人のログイン用)
-- 既存の店舗デモアカウント(demo@modella-test.example.com)と同じ罠(GoTrueの
-- "Database error querying schema")を踏まないよう、confirmation_token等は空文字で埋める。
-- 初期パスワードはログイン後に本人が変更する前提の仮値。
-- =========================================================
do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_email text := 'private.fact@gmail.com';
  v_password text := '11111111';
begin
  if not exists (select 1 from auth.users where email = v_email) then
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, crypt(v_password, gen_salt('bf')),
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

    insert into public.platform_admins (user_id) values (v_user_id);
  end if;
end;
$$;

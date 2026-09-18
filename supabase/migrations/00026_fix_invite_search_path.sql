-- crypt()/gen_salt()はpgcryptoエクステンションが提供する関数で、Supabaseでは
-- publicではなくextensionsスキーマにインストールされている。
-- create_cast_invite(00015)/redeem_cast_login_token・regenerate_cast_login_token(00023)・
-- create_staff_invite/redeem_staff_login_token(00025)はいずれも
-- "set search_path = public, auth" のみでextensionsを含めておらず、
-- 実行時に "function gen_salt(unknown) does not exist" で失敗する既存バグ。
-- (この関数群はSECURITY DEFINERなのでsearch_pathを明示指定する必要があり、
-- 呼び出し側のsearch_pathには依存しないため今まで気づかれずに残っていた)。

create or replace function public.create_cast_invite(p_cast_id uuid)
returns table(login_email text, initial_password text)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
  v_email text;
  v_password text;
  v_encrypted text;
begin
  select shop_id, user_id into v_shop_id, v_user_id from public.cast_members where id = p_cast_id;

  if v_shop_id is null then
    raise exception 'cast not found';
  end if;

  if v_shop_id not in (select public.current_shop_ids()) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  v_encrypted := crypt(v_password, gen_salt('bf'));

  if v_user_id is null then
    v_email := 'cast-' || replace(p_cast_id::text, '-', '') || '@cast.modella.local';
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

    update public.cast_members set user_id = v_user_id where id = p_cast_id;
  else
    select email into v_email from auth.users where id = v_user_id;
    update auth.users set encrypted_password = v_encrypted, updated_at = now() where id = v_user_id;
  end if;

  return query select v_email, v_password;
end;
$$;

create or replace function public.redeem_cast_login_token(p_token uuid)
returns table(login_email text, one_time_password text)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_cast_id uuid;
  v_user_id uuid;
  v_email text;
  v_password text;
  v_encrypted text;
begin
  select cast_id into v_cast_id from public.cast_login_tokens where token = p_token;
  if v_cast_id is null then
    raise exception 'invalid token';
  end if;

  select user_id into v_user_id from public.cast_members where id = v_cast_id;
  if v_user_id is null then
    raise exception 'login not provisioned for this cast yet';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  v_encrypted := crypt(v_password, gen_salt('bf'));
  update auth.users set encrypted_password = v_encrypted, updated_at = now() where id = v_user_id;

  return query select v_email, v_password;
end;
$$;

create or replace function public.create_staff_invite(p_staff_member_id uuid)
returns table(login_email text, initial_password text)
language plpgsql
security definer
set search_path = public, auth, extensions
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

create or replace function public.redeem_staff_login_token(p_token uuid)
returns table(login_email text, one_time_password text)
language plpgsql
security definer
set search_path = public, auth, extensions
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

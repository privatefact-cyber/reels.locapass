-- admin_create_login_for_shop / admin_reset_shop_login_password の2関数だけ、
-- SET search_path に 'extensions' が抜けていた(gen_salt/cryptはpgcryptoが入っている
-- extensionsスキーマにあるため、検索パスに無いと "function gen_salt(unknown) does not exist" になる)。
-- 同種の他の関数(create_cast_invite / create_staff_invite / recover_cast_login 等)は
-- 元から 'extensions' を含んでおり、この2つだけの見落とし。
--
-- 2026-09-14、運営者が管理画面から店舗ログインを発行しようとして初めて顕在化した
-- (このRPCが実際に叩かれたのがこの時が初めてだったと見られる)。

create or replace function public.admin_create_login_for_shop(p_shop_id uuid, p_email text default null::text, p_password text default null::text)
 returns table(login_email text, initial_password text)
 language plpgsql
 security definer
 set search_path to 'public', 'auth', 'extensions'
as $function$
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
$function$;

create or replace function public.admin_reset_shop_login_password(p_shop_staff_id uuid, p_password text default null::text)
 returns table(login_email text, new_password text)
 language plpgsql
 security definer
 set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_user_id uuid;
  v_email text;
  v_password text;
  v_encrypted text;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select user_id, login_email into v_user_id, v_email
  from public.shop_staff where id = p_shop_staff_id;

  if v_user_id is null then
    raise exception 'login not found';
  end if;

  v_password := nullif(trim(coalesce(p_password, '')), '');
  if v_password is null then
    v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  elsif length(v_password) < 6 then
    raise exception 'パスワードは6文字以上にしてください';
  end if;

  v_encrypted := crypt(v_password, gen_salt('bf'));

  update auth.users set encrypted_password = v_encrypted, updated_at = now() where id = v_user_id;

  return query select v_email, v_password;
end;
$function$;

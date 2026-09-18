-- 店舗ログインの発行IDを、UUID連結の意味不明な文字列から、店舗コードベースの短いIDに変更する。
-- 例: shop-3a15c96c11494645929aca39511958fc-ad02bd@shop.modella.local
--     → 4sw7cg@shop.modella.local
-- 同じ店舗に2件目以降を発行するときは -2, -3 ... と番号を振って衝突を避ける
-- (「発行するたびに新しいアカウントが1件作られる」という既存の仕様は変えない)。
-- 管理画面からログインIDを直接指定することも引き続きできる(admin_issue_shop_loginは
-- 互換のため残すが、UIからは admin_create_login_for_shop を直接呼ぶよう変更した)。

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
  v_shop_code text;
  v_base text;
  v_suffix int := 1;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select shop_code into v_shop_code from public.shops where id = p_shop_id;
  if v_shop_code is null then
    raise exception 'shop not found';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'メールアドレスの形式が正しくありません';
  end if;

  if v_email = '' then
    v_base := lower(v_shop_code);
    v_email := v_base || '@shop.modella.local';
    while exists (select 1 from auth.users where email = v_email) loop
      v_suffix := v_suffix + 1;
      v_email := v_base || '-' || v_suffix || '@shop.modella.local';
      exit when v_suffix > 50; -- 保険。通常はここまで到達しない
    end loop;
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

-- 既存のLIRICログイン(UUID連結の見づらいID)を、shop_code方式のIDに付け替える(パスワードは変えない)。
update auth.users u
set email = '4sw7cg@shop.modella.local'
from public.shop_staff ss
where ss.id = '08f10af3-97e4-430f-ae05-9a4f14d3ad10'
  and u.id = ss.user_id;

update public.shop_staff
set login_email = '4sw7cg@shop.modella.local'
where id = '08f10af3-97e4-430f-ae05-9a4f14d3ad10';

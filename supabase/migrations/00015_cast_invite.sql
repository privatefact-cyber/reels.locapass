-- キャストの招待ログイン発行: 店舗管理画面から、キャストごとにログイン用アカウント
-- (仮のログインID+初期パスワード)を発行する。キャスト自身のセルフ登録ではなく、
-- 「店舗が発行してキャストに口頭/紙で伝える」運用を想定(ユーザー合意済み)。
--
-- auth.usersへ直接INSERTするのは、Supabase Admin API(service_roleキー)が
-- このアプリのフロント環境に無いため。confirmation_token等のtext列をNULLのまま
-- 挿入するとGoTrueが"Database error querying schema"を返す実績があるため、
-- 空文字で埋める(project_modella_overviewに記録済みの既知の罠)。
create or replace function public.create_cast_invite(p_cast_id uuid)
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

revoke all on function public.create_cast_invite(uuid) from public;
revoke execute on function public.create_cast_invite(uuid) from anon;
grant execute on function public.create_cast_invite(uuid) to authenticated;

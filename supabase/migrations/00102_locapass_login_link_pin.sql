-- locapass: キャスト/スタッフのログインリンクに6桁PINを必須化
-- ログインリンク(/cast|staff/link/[token])はURLを知っているだけで本人としてログインできた(期限なし・回数無制限)。
-- URL漏洩=なりすまし状態になるため、店舗が発行する6桁PINを併用必須にする。
-- LINEを持たない人もいるため、LINE連携ではなく「リンク+PIN」で本人性を担保する。
-- ・PINはbcryptハッシュで保存(平文は保存しない。発行時に1度だけ画面表示)
-- ・PINを5回連続で間違えるとそのリンクを30分ロック(総当たり対策)
-- ・既存メンバーはpin_hashがnull=PIN発行までリンクログイン不可

alter table public.locapass_cast_login_tokens
  add column if not exists pin_hash text,
  add column if not exists failed_attempts int not null default 0,
  add column if not exists locked_until timestamptz;

create or replace function public.locapass_set_cast_login_pin(p_cast_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_shop_id uuid;
  v_pin text;
begin
  select shop_id into v_shop_id from public.locapass_cast_members where id = p_cast_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if not public.locapass_is_shop_admin(v_shop_id) then
    raise exception 'not authorized';
  end if;

  v_pin := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');

  update public.locapass_cast_login_tokens
  set pin_hash = crypt(v_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null
  where cast_id = p_cast_id;

  return v_pin;
end;
$$;

revoke all on function public.locapass_set_cast_login_pin(uuid) from public;
revoke execute on function public.locapass_set_cast_login_pin(uuid) from anon;
grant execute on function public.locapass_set_cast_login_pin(uuid) to authenticated;

-- リンクの再発行時はPINも無効化する(新PINの発行を強制)。
create or replace function public.locapass_regenerate_cast_login_token(p_cast_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_new_token uuid := gen_random_uuid();
begin
  select shop_id into v_shop_id from public.locapass_cast_members where id = p_cast_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if not public.locapass_is_shop_admin(v_shop_id) then
    raise exception 'not authorized';
  end if;

  update public.locapass_cast_login_tokens
  set token = v_new_token, pin_hash = null, failed_attempts = 0, locked_until = null
  where cast_id = p_cast_id;
  return v_new_token;
end;
$$;

-- 旧シグネチャ(PINなし)は完全に廃止する。
drop function if exists public.locapass_redeem_cast_login_token(uuid);

-- 失敗時にカウンタを残すため、例外ではなくstatusで返す(例外だとupdateがロールバックされる)。
create or replace function public.locapass_redeem_cast_login_token(p_token uuid, p_pin text)
returns table(status text, login_email text, one_time_password text)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_id uuid;
  v_pin_hash text;
  v_failed int;
  v_locked_until timestamptz;
  v_user_id uuid;
  v_email text;
  v_password text;
begin
  select cast_id, pin_hash, failed_attempts, locked_until
    into v_id, v_pin_hash, v_failed, v_locked_until
  from public.locapass_cast_login_tokens
  where token = p_token
  for update;

  if v_id is null or v_pin_hash is null then
    return query select 'invalid'::text, null::text, null::text;
    return;
  end if;

  if v_locked_until is not null and v_locked_until > now() then
    return query select 'locked'::text, null::text, null::text;
    return;
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' or crypt(p_pin, v_pin_hash) <> v_pin_hash then
    v_failed := v_failed + 1;
    if v_failed >= 5 then
      update public.locapass_cast_login_tokens set failed_attempts = 0, locked_until = now() + interval '30 minutes' where cast_id = v_id;
      return query select 'locked'::text, null::text, null::text;
    else
      update public.locapass_cast_login_tokens set failed_attempts = v_failed where cast_id = v_id;
      return query select 'wrong_pin'::text, null::text, null::text;
    end if;
    return;
  end if;

  select user_id into v_user_id from public.locapass_cast_members where id = v_id;
  if v_user_id is null then
    return query select 'invalid'::text, null::text, null::text;
    return;
  end if;

  select email into v_email from auth.users where id = v_user_id;

  v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  update auth.users set encrypted_password = crypt(v_password, gen_salt('bf')), updated_at = now() where id = v_user_id;

  update public.locapass_cast_login_tokens set failed_attempts = 0, locked_until = null where cast_id = v_id;

  return query select 'ok'::text, v_email, v_password;
end;
$$;

revoke all on function public.locapass_redeem_cast_login_token(uuid, text) from public;
grant execute on function public.locapass_redeem_cast_login_token(uuid, text) to anon, authenticated;

alter table public.locapass_staff_login_tokens
  add column if not exists pin_hash text,
  add column if not exists failed_attempts int not null default 0,
  add column if not exists locked_until timestamptz;

create or replace function public.locapass_set_staff_login_pin(p_staff_member_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_shop_id uuid;
  v_pin text;
begin
  select shop_id into v_shop_id from public.locapass_shop_staff_members where id = p_staff_member_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if not public.locapass_is_shop_admin(v_shop_id) then
    raise exception 'not authorized';
  end if;

  v_pin := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');

  update public.locapass_staff_login_tokens
  set pin_hash = crypt(v_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null
  where staff_member_id = p_staff_member_id;

  return v_pin;
end;
$$;

revoke all on function public.locapass_set_staff_login_pin(uuid) from public;
revoke execute on function public.locapass_set_staff_login_pin(uuid) from anon;
grant execute on function public.locapass_set_staff_login_pin(uuid) to authenticated;

-- リンクの再発行時はPINも無効化する(新PINの発行を強制)。
create or replace function public.locapass_regenerate_staff_login_token(p_staff_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_new_token uuid := gen_random_uuid();
begin
  select shop_id into v_shop_id from public.locapass_shop_staff_members where id = p_staff_member_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if not public.locapass_is_shop_admin(v_shop_id) then
    raise exception 'not authorized';
  end if;

  update public.locapass_staff_login_tokens
  set token = v_new_token, pin_hash = null, failed_attempts = 0, locked_until = null
  where staff_member_id = p_staff_member_id;
  return v_new_token;
end;
$$;

-- 旧シグネチャ(PINなし)は完全に廃止する。
drop function if exists public.locapass_redeem_staff_login_token(uuid);

-- 失敗時にカウンタを残すため、例外ではなくstatusで返す(例外だとupdateがロールバックされる)。
create or replace function public.locapass_redeem_staff_login_token(p_token uuid, p_pin text)
returns table(status text, login_email text, one_time_password text)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_id uuid;
  v_pin_hash text;
  v_failed int;
  v_locked_until timestamptz;
  v_user_id uuid;
  v_email text;
  v_password text;
begin
  select staff_member_id, pin_hash, failed_attempts, locked_until
    into v_id, v_pin_hash, v_failed, v_locked_until
  from public.locapass_staff_login_tokens
  where token = p_token
  for update;

  if v_id is null or v_pin_hash is null then
    return query select 'invalid'::text, null::text, null::text;
    return;
  end if;

  if v_locked_until is not null and v_locked_until > now() then
    return query select 'locked'::text, null::text, null::text;
    return;
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' or crypt(p_pin, v_pin_hash) <> v_pin_hash then
    v_failed := v_failed + 1;
    if v_failed >= 5 then
      update public.locapass_staff_login_tokens set failed_attempts = 0, locked_until = now() + interval '30 minutes' where staff_member_id = v_id;
      return query select 'locked'::text, null::text, null::text;
    else
      update public.locapass_staff_login_tokens set failed_attempts = v_failed where staff_member_id = v_id;
      return query select 'wrong_pin'::text, null::text, null::text;
    end if;
    return;
  end if;

  select user_id into v_user_id from public.locapass_shop_staff_members where id = v_id;
  if v_user_id is null then
    return query select 'invalid'::text, null::text, null::text;
    return;
  end if;

  select email into v_email from auth.users where id = v_user_id;

  v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  update auth.users set encrypted_password = crypt(v_password, gen_salt('bf')), updated_at = now() where id = v_user_id;

  update public.locapass_staff_login_tokens set failed_attempts = 0, locked_until = null where staff_member_id = v_id;

  return query select 'ok'::text, v_email, v_password;
end;
$$;

revoke all on function public.locapass_redeem_staff_login_token(uuid, text) from public;
grant execute on function public.locapass_redeem_staff_login_token(uuid, text) to anon, authenticated;

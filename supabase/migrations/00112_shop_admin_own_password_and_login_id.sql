-- 店舗管理者(locapass_shop_admins)は、発行時に一度だけ表示されるログインID/初期パスワードの
-- 画面を閉じると、自分のログインIDすら二度と確認できず、パスワードも自分で変更できなかった
-- (ユーザー指摘、2026-09-29: 「入れても永久に自分のIDパスがわからない」)。
--
-- 対策:
--  1. locapass_shop_admins にも password_set_at を追加し、set_own_password /
--     needs_password_setup / clear_password_set_flag の対象に含める
--     (00108_own_password_setup.sqlと同じ仕組みをshop_adminにも適用)。
--  2. ダッシュボードから自分のログインID(login_email)を取得できるRPCを追加する。

alter table public.locapass_shop_admins add column if not exists password_set_at timestamptz;

create or replace function public.clear_password_set_flag()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and coalesce(current_setting('app.own_password', true), '') <> '1' then
    update public.cast_members set password_set_at = null where user_id = new.id and password_set_at is not null;
    update public.shop_staff_members set password_set_at = null where user_id = new.id and password_set_at is not null;
    update public.locapass_cast_members set password_set_at = null where user_id = new.id and password_set_at is not null;
    update public.locapass_shop_staff_members set password_set_at = null where user_id = new.id and password_set_at is not null;
    update public.locapass_shop_admins set password_set_at = null where user_id = new.id and password_set_at is not null;
  end if;
  return new;
end;
$$;

create or replace function public.set_own_password(p_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_password is null or char_length(p_password) < 6 then
    raise exception 'password too short';
  end if;
  if not (
    exists (select 1 from public.cast_members where user_id = v_uid)
    or exists (select 1 from public.shop_staff_members where user_id = v_uid)
    or exists (select 1 from public.locapass_cast_members where user_id = v_uid)
    or exists (select 1 from public.locapass_shop_staff_members where user_id = v_uid)
    or exists (select 1 from public.locapass_shop_admins where user_id = v_uid)
  ) then
    raise exception 'not a cast/staff/shop_admin account';
  end if;

  perform set_config('app.own_password', '1', true);
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = v_uid;

  update public.cast_members set password_set_at = now() where user_id = v_uid;
  update public.shop_staff_members set password_set_at = now() where user_id = v_uid;
  update public.locapass_cast_members set password_set_at = now() where user_id = v_uid;
  update public.locapass_shop_staff_members set password_set_at = now() where user_id = v_uid;
  update public.locapass_shop_admins set password_set_at = now() where user_id = v_uid;
end;
$$;

revoke all on function public.set_own_password(text) from public, anon;
grant execute on function public.set_own_password(text) to authenticated;

create or replace function public.needs_password_setup()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select bool_or(pending) from (
      select password_set_at is null as pending from public.cast_members where user_id = auth.uid()
      union all select password_set_at is null from public.shop_staff_members where user_id = auth.uid()
      union all select password_set_at is null from public.locapass_cast_members where user_id = auth.uid()
      union all select password_set_at is null from public.locapass_shop_staff_members where user_id = auth.uid()
      union all select password_set_at is null from public.locapass_shop_admins where user_id = auth.uid()
    ) t
  ), false);
$$;

revoke all on function public.needs_password_setup() from public, anon;
grant execute on function public.needs_password_setup() to authenticated;

-- 本人が自分のログインID(login_email)を確認する。発行時の画面を閉じた後でも、
-- ダッシュボードのアカウント設定からいつでも見返せるようにする。
create or replace function public.locapass_my_shop_admin_login_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select login_email from public.locapass_shop_admins where user_id = auth.uid() limit 1;
$$;

revoke all on function public.locapass_my_shop_admin_login_email() from public, anon;
grant execute on function public.locapass_my_shop_admin_login_email() to authenticated;

-- キャスト/スタッフ(locapassのパートナー含む)が、ワンタイムパスワードでの初回ログイン後に
-- 自分で決めたパスワード(6文字以上)へ変更できるようにする。
-- password_set_at が null = まだワンタイムパスワードのまま(マイページで設定を促す)。
-- 招待・リンク+PINログイン・復旧などでパスワードが機械的に上書きされたら、トリガーで null に戻す。

alter table public.cast_members add column if not exists password_set_at timestamptz;
alter table public.shop_staff_members add column if not exists password_set_at timestamptz;
alter table public.locapass_cast_members add column if not exists password_set_at timestamptz;
alter table public.locapass_shop_staff_members add column if not exists password_set_at timestamptz;

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
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_password_set_flag on auth.users;
create trigger trg_clear_password_set_flag
  after update of encrypted_password on auth.users
  for each row execute function public.clear_password_set_flag();

-- 本人がパスワードを自分で設定する。
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
  ) then
    raise exception 'not a cast/staff account';
  end if;

  perform set_config('app.own_password', '1', true);
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = v_uid;

  update public.cast_members set password_set_at = now() where user_id = v_uid;
  update public.shop_staff_members set password_set_at = now() where user_id = v_uid;
  update public.locapass_cast_members set password_set_at = now() where user_id = v_uid;
  update public.locapass_shop_staff_members set password_set_at = now() where user_id = v_uid;
end;
$$;

revoke all on function public.set_own_password(text) from public, anon;
grant execute on function public.set_own_password(text) to authenticated;

-- ワンタイムパスワードのままか(=設定を促すべきか)。
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
    ) t
  ), false);
$$;

revoke all on function public.needs_password_setup() from public, anon;
grant execute on function public.needs_password_setup() to authenticated;

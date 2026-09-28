-- locapass の店舗管理者(shop_admin)がログインID/パスワードを忘れた場合の自己復旧。
-- これまでは運営(ポータル管理者)への問い合わせ→手動でのパスワード再発行しか無かった。
-- 「店舗コード」方式(LUXELA版 recover_shop_login と同じ設計)は、店舗コード自体を
-- 担当者が忘れることがあるため採用せず、本人(担当者個人)の電話番号+生年月日+
-- 4桁PINの3項目一致を本人確認に使う(ユーザー指摘: 電話+生年月日だけだと他人でも
-- 知りうる可能性があるためPINで強化する)。
--
-- PINは平文を保持せずbcryptハッシュ(pin_hash)のみ保存する。
-- 3項目すべて登録済みでない場合はダッシュボード側で登録を必須にする
-- (locapass_shop_admin_needs_recovery_setup で判定)。
--
-- これも自己復旧できない(PINまで忘れた等)場合は、従来どおり運営による
-- 手動パスワード再発行(resetShopAdminPassword)に頼る。それ自体は残す。

alter table public.locapass_shop_admins
  add column if not exists phone text,
  add column if not exists birth_date date,
  add column if not exists pin_hash text;

create table if not exists public.locapass_shop_admin_recovery_attempts (
  id bigint generated always as identity primary key,
  attempt_key text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists locapass_shop_admin_recovery_attempts_key_idx
  on public.locapass_shop_admin_recovery_attempts (attempt_key, attempted_at desc);
alter table public.locapass_shop_admin_recovery_attempts enable row level security;
revoke all on table public.locapass_shop_admin_recovery_attempts from anon, authenticated;

-- 本人(ログイン中のshop_admin)が自分の復旧用情報(電話番号・生年月日・PIN)を登録・更新する。
create or replace function public.set_locapass_shop_admin_recovery_info(p_phone text, p_birth_date date, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_normalized_phone text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_phone is null or p_birth_date is null or p_pin is null then
    raise exception 'phone, birth_date, pin are required';
  end if;

  v_normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if v_normalized_phone = '' then
    raise exception 'invalid phone';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'pin must be 4 digits';
  end if;
  if not exists (select 1 from public.locapass_shop_admins where user_id = v_uid) then
    raise exception 'not a shop admin';
  end if;

  update public.locapass_shop_admins
  set phone = v_normalized_phone,
      birth_date = p_birth_date,
      pin_hash = crypt(p_pin, gen_salt('bf'))
  where user_id = v_uid;
end;
$$;

revoke all on function public.set_locapass_shop_admin_recovery_info(text, date, text) from public, anon;
grant execute on function public.set_locapass_shop_admin_recovery_info(text, date, text) to authenticated;

-- 電話番号・生年月日・PINのいずれかが未登録か(初回ログイン時の必須ゲートに使う)。
create or replace function public.locapass_shop_admin_needs_recovery_setup()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select bool_or(phone is null or birth_date is null or pin_hash is null)
    from public.locapass_shop_admins where user_id = auth.uid()
  ), false);
$$;

revoke all on function public.locapass_shop_admin_needs_recovery_setup() from public, anon;
grant execute on function public.locapass_shop_admin_needs_recovery_setup() to authenticated;

-- 電話番号+生年月日+PINが一致すればパスワードを再発行して返す(未ログインで呼べる)。
-- 電話番号ごとに24時間で失敗5回までに制限し、試行記録は電話番号そのものではなくハッシュで持つ
-- (recover_cast_login / recover_shop_login と同じ設計)。
create or replace function public.recover_locapass_shop_admin_login(p_phone text, p_birth_date date, p_pin text)
returns table(login_email text, one_time_password text)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
  v_email text;
  v_password text;
  v_encrypted text;
  v_normalized_phone text;
  v_attempt_key text;
begin
  if p_phone is null or p_birth_date is null or p_pin is null then
    raise exception 'phone, birth_date, pin are required';
  end if;

  v_normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if v_normalized_phone = '' or p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid input';
  end if;

  v_attempt_key := encode(extensions.digest('locapass-shop-admin-recover:' || v_normalized_phone, 'sha256'), 'hex');

  delete from public.locapass_shop_admin_recovery_attempts where attempted_at < now() - interval '7 days';

  if (select count(*) from public.locapass_shop_admin_recovery_attempts a
      where a.attempt_key = v_attempt_key
        and not a.succeeded
        and a.attempted_at > now() - interval '24 hours') >= 5 then
    return query select null::text, null::text;
    return;
  end if;

  if (select count(*) from public.locapass_shop_admins
      where phone is not null
        and birth_date = p_birth_date
        and pin_hash is not null
        and regexp_replace(phone, '[^0-9]', '', 'g') = v_normalized_phone
        and pin_hash = crypt(p_pin, pin_hash)) <> 1 then
    insert into public.locapass_shop_admin_recovery_attempts (attempt_key, succeeded) values (v_attempt_key, false);
    return;
  end if;

  select user_id into v_user_id
  from public.locapass_shop_admins
  where phone is not null
    and birth_date = p_birth_date
    and pin_hash is not null
    and regexp_replace(phone, '[^0-9]', '', 'g') = v_normalized_phone
    and pin_hash = crypt(p_pin, pin_hash);

  select email into v_email from auth.users where id = v_user_id;

  v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  v_encrypted := crypt(v_password, gen_salt('bf'));
  update auth.users set encrypted_password = v_encrypted, updated_at = now() where id = v_user_id;

  insert into public.locapass_shop_admin_recovery_attempts (attempt_key, succeeded) values (v_attempt_key, true);

  return query select v_email, v_password;
end;
$$;

revoke all on function public.recover_locapass_shop_admin_login(text, date, text) from public;
grant execute on function public.recover_locapass_shop_admin_login(text, date, text) to anon, authenticated;

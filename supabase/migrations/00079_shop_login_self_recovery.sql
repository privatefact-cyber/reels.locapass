-- 店舗ログインの「ID・パスワードを忘れた」自己復旧。
-- これまではキャストには電話番号+生年月日での自己復旧があったが、店舗ログインには
-- 運営者による手動再発行しか無く、忘れるたびに運営者への問い合わせが発生していた
-- (ユーザー指摘、2026-09-14)。
--
-- 本人確認は「店舗コード(shop_code、店舗詳細画面に常時表示され店舗も把握している)」+
-- 「登録電話番号」の組み合わせ。cast版のrecover_cast_loginと同じ設計(24時間5回まで、
-- 試行はハッシュ化して保存、失敗しても情報は返さない)。

create table if not exists public.shop_login_recovery_attempts (
  id bigint generated always as identity primary key,
  attempt_key text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists shop_login_recovery_attempts_key_idx
  on public.shop_login_recovery_attempts (attempt_key, attempted_at desc);
alter table public.shop_login_recovery_attempts enable row level security;
revoke all on table public.shop_login_recovery_attempts from anon, authenticated;

create or replace function public.recover_shop_login(p_shop_code text, p_phone text)
returns table(login_email text, one_time_password text)
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
  v_normalized_phone text;
  v_normalized_code text;
  v_attempt_key text;
begin
  if p_shop_code is null or p_phone is null then
    raise exception 'shop_code and phone are required';
  end if;

  v_normalized_code := upper(trim(p_shop_code));
  v_normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if v_normalized_code = '' or v_normalized_phone = '' then
    raise exception 'invalid input';
  end if;

  v_attempt_key := encode(extensions.digest('shop-recover:' || v_normalized_code || ':' || v_normalized_phone, 'sha256'), 'hex');

  delete from public.shop_login_recovery_attempts where attempted_at < now() - interval '7 days';

  if (select count(*) from public.shop_login_recovery_attempts a
      where a.attempt_key = v_attempt_key
        and not a.succeeded
        and a.attempted_at > now() - interval '24 hours') >= 5 then
    return query select null::text, null::text;
    return;
  end if;

  select id into v_shop_id
  from public.shops
  where shop_code = v_normalized_code
    and phone is not null
    and regexp_replace(phone, '[^0-9]', '', 'g') = v_normalized_phone;

  if v_shop_id is null then
    insert into public.shop_login_recovery_attempts (attempt_key, succeeded) values (v_attempt_key, false);
    return;
  end if;

  -- 店舗に複数ログインが発行されていることもあるため、最初に発行されたownerロールのものだけを対象にする。
  select ss.user_id, ss.login_email into v_user_id, v_email
  from public.shop_staff ss
  where ss.shop_id = v_shop_id and ss.role = 'owner'
  order by ss.created_at asc
  limit 1;

  if v_user_id is null then
    insert into public.shop_login_recovery_attempts (attempt_key, succeeded) values (v_attempt_key, false);
    return;
  end if;

  v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  v_encrypted := crypt(v_password, gen_salt('bf'));
  update auth.users set encrypted_password = v_encrypted, updated_at = now() where id = v_user_id;

  insert into public.shop_login_recovery_attempts (attempt_key, succeeded) values (v_attempt_key, true);

  return query select v_email, v_password;
end;
$$;

revoke execute on function public.recover_shop_login(text, text) from public;
grant execute on function public.recover_shop_login(text, text) to anon, authenticated;

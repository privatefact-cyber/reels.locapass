-- Supabaseアドバイザーの既存指摘への対応(2026-09-13)。
--
-- 1. public.operators … RLS無効でanonが読み書き・削除できた。sos-watchは sos_watch.operators を使っており、
--    こちらはどのアプリからも参照されていない残骸(1行)。データは残したまま外部からのアクセスだけ塞ぐ。
-- 2. check_person_risk … ログインしていれば誰でも呼べた。店舗スタッフ・運営者・サーバー(service role)だけにする。
--    (照合用ハッシュはサーバー専用のペッパー付きHMACなので外部から当てるのは困難だが、多層防御として)
-- 3. recover_cast_login … 未ログインで電話番号+生年月日を無制限に試せ、一致するとパスワードを再発行して返していた。
--    電話番号ごとに24時間で失敗5回までに制限する。試行記録は電話番号そのものではなくハッシュで持つ。
--    上限到達時は login_email/one_time_password がnullの1行を返す(画面で「時間をおいて」と出し分ける)。
--    失敗時に例外を投げると試行記録ごとロールバックされるので、失敗は「0行」で返す。
-- 4. トリガー専用関数・運営者用関数を /rest/v1/rpc から未ログインで呼べないようにする。

alter table public.operators enable row level security;
revoke all on table public.operators from anon, authenticated;

create or replace function public.check_person_risk(p_phone_hash text, p_name_hash text, p_dob_hash text, p_target_type text default 'customer'::text)
returns table(match_level text, max_risk_level integer, hit_count integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not exists (select 1 from public.current_shop_ids())
     and not public.is_platform_admin() then
    raise exception 'not allowed';
  end if;

  return query
  with matches as (
    select
      b.risk_level,
      (
        (case when b.phone_hash is not null and p_phone_hash is not null and b.phone_hash = p_phone_hash then 1 else 0 end) +
        (case when b.name_hash is not null and p_name_hash is not null and b.name_hash = p_name_hash then 1 else 0 end) +
        (case when b.dob_hash is not null and p_dob_hash is not null and b.dob_hash = p_dob_hash then 1 else 0 end)
      ) as match_count
    from public.blacklists b
    where b.target_type = p_target_type
      and b.status = 'active'
  )
  select
    case
      when count(*) filter (where m.match_count >= 2) > 0 then 'flagged'
      when count(*) filter (where m.match_count = 1) > 0 then 'caution'
      else 'none'
    end::text,
    coalesce(
      max(m.risk_level) filter (where m.match_count >= 2),
      max(m.risk_level) filter (where m.match_count = 1)
    )::integer,
    case
      when count(*) filter (where m.match_count >= 2) > 0
        then (count(*) filter (where m.match_count >= 2))::integer
      when count(*) filter (where m.match_count = 1) > 0
        then (count(*) filter (where m.match_count = 1))::integer
      else 0
    end
  from matches m;
end;
$$;

create table if not exists public.cast_login_recovery_attempts (
  id bigint generated always as identity primary key,
  phone_key text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists cast_login_recovery_attempts_key_idx
  on public.cast_login_recovery_attempts (phone_key, attempted_at desc);
alter table public.cast_login_recovery_attempts enable row level security;
revoke all on table public.cast_login_recovery_attempts from anon, authenticated;

create or replace function public.recover_cast_login(p_phone text, p_birth_date date)
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
  v_normalized_phone text;
  v_phone_key text;
begin
  if p_phone is null or p_birth_date is null then
    raise exception 'phone and birth_date are required';
  end if;

  v_normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if v_normalized_phone = '' then
    raise exception 'invalid phone';
  end if;

  v_phone_key := encode(extensions.digest('cast-recover:' || v_normalized_phone, 'sha256'), 'hex');

  delete from public.cast_login_recovery_attempts where attempted_at < now() - interval '7 days';

  if (select count(*) from public.cast_login_recovery_attempts a
      where a.phone_key = v_phone_key
        and not a.succeeded
        and a.attempted_at > now() - interval '24 hours') >= 5 then
    return query select null::text, null::text;
    return;
  end if;

  if (select count(*) from public.cast_members
      where phone is not null
        and birth_date = p_birth_date
        and regexp_replace(phone, '[^0-9]', '', 'g') = v_normalized_phone) <> 1 then
    insert into public.cast_login_recovery_attempts (phone_key, succeeded) values (v_phone_key, false);
    return;
  end if;

  select id, user_id into v_cast_id, v_user_id
  from public.cast_members
  where phone is not null
    and birth_date = p_birth_date
    and regexp_replace(phone, '[^0-9]', '', 'g') = v_normalized_phone;

  v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  v_encrypted := crypt(v_password, gen_salt('bf'));

  if v_user_id is null then
    v_email := 'cast-' || replace(v_cast_id::text, '-', '') || '@cast.modella.local';
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

    update public.cast_members set user_id = v_user_id where id = v_cast_id;
  else
    select email into v_email from auth.users where id = v_user_id;
    update auth.users set encrypted_password = v_encrypted, updated_at = now() where id = v_user_id;
  end if;

  insert into public.cast_login_recovery_attempts (phone_key, succeeded) values (v_phone_key, true);

  return query select v_email, v_password;
end;
$$;

revoke execute on function public.create_cast_login_token() from public, anon, authenticated;
revoke execute on function public.create_staff_login_token() from public, anon, authenticated;
revoke execute on function public.dispatch_push_for_notification() from public, anon, authenticated;
revoke execute on function public.mark_inquiry_status_on_message() from public, anon, authenticated;
revoke execute on function public.notify_new_cast() from public, anon, authenticated;
revoke execute on function public.notify_new_event() from public, anon, authenticated;
revoke execute on function public.notify_new_reel() from public, anon, authenticated;

revoke execute on function public.admin_provision_shop(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_provision_shop(text, text, text, text, text, text, text) to authenticated, service_role;

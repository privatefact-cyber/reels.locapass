-- キャスト本人がログインID/パスワードを忘れた・LINEアカウントを変えた等でログインできなくなった場合の
-- セルフサービス復旧。店舗への問い合わせなしに、登録済みの電話番号+生年月日が一致すれば
-- その場で新しいログイン情報(create_cast_invite / redeem_cast_login_tokenと同じ発行ロジック)を返す。
--
-- SMS/メールでの本人確認は使わない(SMSは登録規模的にコスト過大、メールはcast.modella.local宛の
-- 実在しないダミーアドレスのため送信不可 — 00015_cast_invite.sql参照)。
-- 電話番号+生年月日の一致を知識ベースの本人確認として使う(与信照会と同じ2項目)。
--
-- どちらの項目が不一致だったかは返さない(enumeration対策)。一致する応募者が複数いる場合も
-- 特定できないため復旧を拒否する。

-- pgcryptoの crypt/gen_salt は extensions スキーマにあるため、search_pathに含めないと
-- "function gen_salt(unknown) does not exist" になる(検証時に発覚、既存のcreate_cast_invite等
-- 同系統の関数も同じ落とし穴を抱えている可能性があるので変更時は要確認)。
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
begin
  if p_phone is null or p_birth_date is null then
    raise exception 'phone and birth_date are required';
  end if;

  v_normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if v_normalized_phone = '' then
    raise exception 'invalid phone';
  end if;

  select id, user_id into v_cast_id, v_user_id
  from public.cast_members
  where phone is not null
    and birth_date = p_birth_date
    and regexp_replace(phone, '[^0-9]', '', 'g') = v_normalized_phone
  limit 2;

  -- limit 2で2件目が拾えてしまったら重複扱いにして拒否する(limit 1だと複数一致に気づけない)
  if (select count(*) from public.cast_members
      where phone is not null
        and birth_date = p_birth_date
        and regexp_replace(phone, '[^0-9]', '', 'g') = v_normalized_phone) <> 1 then
    raise exception 'not found';
  end if;

  select id, user_id into v_cast_id, v_user_id
  from public.cast_members
  where phone is not null
    and birth_date = p_birth_date
    and regexp_replace(phone, '[^0-9]', '', 'g') = v_normalized_phone;

  v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  v_encrypted := crypt(v_password, gen_salt('bf'));

  if v_user_id is null then
    -- create_cast_invite(uuid)と同じ発行ロジック(店舗管理画面から発行されていなかった場合の初回発行)
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

  return query select v_email, v_password;
end;
$$;

revoke all on function public.recover_cast_login(text, date) from public;
-- ログイン前(未認証)のキャスト本人が使うため、anonにも実行権限を与える
grant execute on function public.recover_cast_login(text, date) to anon, authenticated;

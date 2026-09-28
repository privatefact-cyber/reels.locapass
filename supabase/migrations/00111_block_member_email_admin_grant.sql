-- locapass_grant_shop_admin / locapass_grant_portal_admin は、入力されたメールが
-- 既にauth.usersに存在する場合、パスワードを上書きせず「既存アカウントへの権限付与」として
-- 処理していた。しかしこれは相手が誰のアカウントかを一切チェックしていなかったため、
-- 一般会員(locapass_members、お客様)のメールを誤って入力すると、そのお客様の会員アカウントに
-- 店舗管理者/ポータル管理者権限がそのまま付与されてしまう事故があった
-- (2026-09-29、yes@id4s.com の一般会員アカウントに shop_admin 権限が誤付与された実例で発覚)。
--
-- 対策として、入力メールが一般会員アカウントのものだった場合は権限付与自体を拒否する
-- (お客様アカウントへの意図しない権限昇格を防ぐ多層防御)。

create or replace function public.locapass_grant_shop_admin(
  p_shop_id uuid, p_email text default null, p_password text default null
) returns table(login_email text, initial_password text)
language plpgsql security definer set search_path = public as $$
declare
  v_portal_id bigint;
  v_shop_code text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_password text := nullif(trim(coalesce(p_password, '')), '');
  v_base text;
  v_suffix int := 1;
  v_user_id uuid;
  v_created boolean;
begin
  select portal_id, shop_code into v_portal_id, v_shop_code from locapass_shops where id = p_shop_id;
  if v_portal_id is null then raise exception 'shop not found'; end if;
  if not locapass_is_portal_admin(v_portal_id) then raise exception 'forbidden'; end if;

  if v_email = '' then
    v_base := lower(v_shop_code);
    v_email := v_base || '@shop.locapass.local';
    while exists (select 1 from auth.users where email = v_email) loop
      v_suffix := v_suffix + 1;
      v_email := v_base || '-' || v_suffix || '@shop.locapass.local';
      exit when v_suffix > 50;
    end loop;
  elsif v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'メールアドレスの形式が正しくありません';
  end if;

  if exists (
    select 1 from auth.users u join locapass_members m on m.id = u.id where lower(u.email) = v_email
  ) then
    raise exception 'このメールアドレスは一般会員として登録済みのため、店舗管理者権限は付与できません(お客様アカウントの誤操作防止)。別のメールアドレスを使うか、空欄のまま発行してください';
  end if;

  if v_password is null then
    v_password := locapass__new_password();
  elsif length(v_password) < 6 then
    raise exception 'パスワードは6文字以上にしてください';
  end if;

  select u.user_id, u.created into v_user_id, v_created from locapass__ensure_auth_user(v_email, v_password) u;
  insert into locapass_shop_admins (shop_id, user_id, login_email) values (p_shop_id, v_user_id, v_email)
    on conflict (shop_id, user_id) do nothing;
  return query select v_email, case when v_created then v_password else null end;
end;
$$;

create or replace function public.locapass_grant_portal_admin(p_portal_id bigint, p_email text)
returns table(login_email text, initial_password text)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_password text := locapass__new_password();
  v_user_id uuid;
  v_created boolean;
begin
  if not locapass_is_super_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from locapass_portals where id = p_portal_id) then raise exception 'portal not found'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'メールアドレスの形式が正しくありません'; end if;

  if exists (
    select 1 from auth.users u join locapass_members m on m.id = u.id where lower(u.email) = v_email
  ) then
    raise exception 'このメールアドレスは一般会員として登録済みのため、ポータル管理者権限は付与できません(お客様アカウントの誤操作防止)。別のメールアドレスを使ってください';
  end if;

  select u.user_id, u.created into v_user_id, v_created from locapass__ensure_auth_user(v_email, v_password) u;
  insert into locapass_portal_admins (portal_id, user_id) values (p_portal_id, v_user_id) on conflict do nothing;
  return query select v_email, case when v_created then v_password else null end;
end;
$$;

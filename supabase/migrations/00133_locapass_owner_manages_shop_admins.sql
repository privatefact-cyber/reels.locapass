-- 店舗のオーナー自身が、同じ店舗の「管理者」を追加・削除できるようにする。(2026-10-23)
--  - locapass_shop_admins に role(owner/manager)を追加。既存はすべて owner。
--  - 管理者の追加・削除ができるのは、その店舗の owner だけ(manager は不可)。追加できるのは manager のみ。1店舗あたり最大5人。
--  - owner は、ここからは外せない(運営だけ)。
--  - 追加・削除は locapass_shop_admin_audit に記録する。
--  - 同じ店舗の管理者同士でも、互いの復旧用情報(電話・生年月日・PINのハッシュ)が読めないよう、表のSELECTを「自分の行だけ」に絞る
--    (運営は従来どおり読める)。一覧は locapass_list_shop_admins(メール・種別・日付だけ)で返す。

alter table public.locapass_shop_admins
  add column if not exists role text not null default 'owner' check (role in ('owner', 'manager')),
  add column if not exists created_by uuid references auth.users (id) on delete set null;

create table if not exists public.locapass_shop_admin_audit (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  actor_id uuid,
  action text not null check (action in ('add', 'remove')),
  target_email text,
  created_at timestamptz not null default now()
);
alter table public.locapass_shop_admin_audit enable row level security;
drop policy if exists shop_admin_audit_read on public.locapass_shop_admin_audit;
create policy shop_admin_audit_read on public.locapass_shop_admin_audit for select to authenticated
  using (public.locapass_is_portal_admin((select s.portal_id from public.locapass_shops s where s.id = shop_id)));
grant select on public.locapass_shop_admin_audit to authenticated;

-- 同じ店舗の管理者同士でも復旧用情報を読めないようにする(自分の行だけ。運営は別ポリシー ALL で従来どおり)。
drop policy if exists "shop admins read" on public.locapass_shop_admins;
drop policy if exists shop_admins_read_own on public.locapass_shop_admins;
create policy shop_admins_read_own on public.locapass_shop_admins for select using (user_id = auth.uid());

-- 管理者の一覧(メール・種別・日付だけ)。その店舗の管理者(と運営)が読める。
create or replace function public.locapass_list_shop_admins(p_shop_id uuid)
returns table (id uuid, login_email text, role text, created_at timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not locapass_is_shop_admin(p_shop_id) then raise exception 'forbidden'; end if;
  return query
    select a.id, a.login_email, a.role, a.created_at, (a.user_id = auth.uid())
    from locapass_shop_admins a
    where a.shop_id = p_shop_id
    order by (a.role = 'owner') desc, a.created_at;
end;
$$;

-- オーナーが管理者(manager)を追加する。メールが空なら自動のログインIDを作る。初期パスワードは作成時の戻り値でだけ分かる。
create or replace function public.locapass_owner_add_shop_admin(p_shop_id uuid, p_email text default null, p_password text default null)
returns table (login_email text, initial_password text)
language plpgsql security definer set search_path = public as $$
declare
  v_shop_code text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_password text := nullif(trim(coalesce(p_password, '')), '');
  v_base text;
  v_suffix int := 1;
  v_user_id uuid;
  v_created boolean;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if not exists (select 1 from locapass_shop_admins a where a.shop_id = p_shop_id and a.user_id = auth.uid() and a.role = 'owner') then
    raise exception 'forbidden';
  end if;
  select shop_code into v_shop_code from locapass_shops where id = p_shop_id;
  if v_shop_code is null then raise exception 'shop not found'; end if;

  -- 同時に何人も追加して上限を超えないよう、店舗単位で直列化する。
  perform pg_advisory_xact_lock(hashtext('locapass_shop_admins:' || p_shop_id::text));
  if (select count(*) from locapass_shop_admins where shop_id = p_shop_id) >= 5 then
    raise exception '管理者は1店舗あたり5人までです';
  end if;

  if v_email = '' then
    v_base := lower(v_shop_code) || '-m';
    v_email := v_base || v_suffix || '@shop.locapass.local';
    while exists (select 1 from auth.users where lower(email) = v_email) loop
      v_suffix := v_suffix + 1;
      v_email := v_base || v_suffix || '@shop.locapass.local';
      exit when v_suffix > 50;
    end loop;
  elsif v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'メールアドレスの形式が正しくありません';
  end if;
  -- 既存のアカウント(一般会員・他店舗の管理者など)は、ここからは紐づけない。
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'このメールアドレスは既に登録されています。別のメールアドレスを使うか、空欄のまま発行してください';
  end if;

  if v_password is null then
    v_password := locapass__new_password();
  elsif length(v_password) < 6 then
    raise exception 'パスワードは6文字以上にしてください';
  end if;

  select u.user_id, u.created into v_user_id, v_created from locapass__ensure_auth_user(v_email, v_password) u;
  insert into locapass_shop_admins (shop_id, user_id, login_email, role, created_by)
    values (p_shop_id, v_user_id, v_email, 'manager', auth.uid());
  insert into locapass_shop_admin_audit (shop_id, actor_id, action, target_email) values (p_shop_id, auth.uid(), 'add', v_email);
  return query select v_email, v_password;
end;
$$;

-- オーナーが管理者(manager)を外す。owner は外せない(運営だけ)。
create or replace function public.locapass_owner_remove_shop_admin(p_shop_admin_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_shop_id uuid;
  v_role text;
  v_email text;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  select shop_id, role, login_email into v_shop_id, v_role, v_email from locapass_shop_admins where id = p_shop_admin_id;
  if v_shop_id is null then raise exception 'not found'; end if;
  if not exists (select 1 from locapass_shop_admins a where a.shop_id = v_shop_id and a.user_id = auth.uid() and a.role = 'owner') then
    raise exception 'forbidden';
  end if;
  if v_role <> 'manager' then raise exception 'オーナーは、ここからは外せません。運営にご連絡ください'; end if;
  delete from locapass_shop_admins where id = p_shop_admin_id;
  insert into locapass_shop_admin_audit (shop_id, actor_id, action, target_email) values (v_shop_id, auth.uid(), 'remove', v_email);
end;
$$;

revoke all on function public.locapass_list_shop_admins(uuid) from public, anon;
revoke all on function public.locapass_owner_add_shop_admin(uuid, text, text) from public, anon;
revoke all on function public.locapass_owner_remove_shop_admin(uuid) from public, anon;
grant execute on function public.locapass_list_shop_admins(uuid) to authenticated;
grant execute on function public.locapass_owner_add_shop_admin(uuid, text, text) to authenticated;
grant execute on function public.locapass_owner_remove_shop_admin(uuid) to authenticated;

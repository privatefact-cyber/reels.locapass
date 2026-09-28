-- キャスト/スタッフ(LUXELA本家 + locapass「パートナー」)を店舗から削除できるようにする。
-- ただし即時のハード削除ではなくソフト削除にし、退店から30日以内なら同じアカウント
-- (ログイン情報・投稿履歴など)をそのまま復帰させられるようにする。
-- 30日を過ぎたものは復帰対象から外れる(将来的な物理削除は別途検討。今回は非表示化のみ)。

alter table public.cast_members add column if not exists deleted_at timestamptz;
alter table public.shop_staff_members add column if not exists deleted_at timestamptz;
alter table public.locapass_cast_members add column if not exists deleted_at timestamptz;
alter table public.locapass_shop_staff_members add column if not exists deleted_at timestamptz;

-- ========== LUXELA本家: キャスト ==========

create or replace function public.soft_delete_cast_member(p_cast_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
begin
  select shop_id, user_id into v_shop_id, v_user_id from public.cast_members where id = p_cast_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if v_shop_id not in (select public.current_shop_ids()) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  update public.cast_members set deleted_at = now() where id = p_cast_id;
  if v_user_id is not null then
    update auth.users set banned_until = 'infinity' where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.soft_delete_cast_member(uuid) from public, anon;
grant execute on function public.soft_delete_cast_member(uuid) to authenticated;

create or replace function public.restore_cast_member(p_cast_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
  v_deleted_at timestamptz;
begin
  select shop_id, user_id, deleted_at into v_shop_id, v_user_id, v_deleted_at
  from public.cast_members where id = p_cast_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if v_shop_id not in (select public.current_shop_ids()) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if v_deleted_at is null then
    raise exception 'not deleted';
  end if;
  if v_deleted_at < now() - interval '30 days' then
    raise exception 'restore window expired';
  end if;

  update public.cast_members set deleted_at = null where id = p_cast_id;
  if v_user_id is not null then
    update auth.users set banned_until = null where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.restore_cast_member(uuid) from public, anon;
grant execute on function public.restore_cast_member(uuid) to authenticated;

-- ========== LUXELA本家: スタッフ ==========

create or replace function public.soft_delete_staff_member(p_staff_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
begin
  select shop_id, user_id into v_shop_id, v_user_id from public.shop_staff_members where id = p_staff_member_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if v_shop_id not in (select public.current_shop_ids()) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  update public.shop_staff_members set deleted_at = now() where id = p_staff_member_id;
  if v_user_id is not null then
    update auth.users set banned_until = 'infinity' where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.soft_delete_staff_member(uuid) from public, anon;
grant execute on function public.soft_delete_staff_member(uuid) to authenticated;

create or replace function public.restore_staff_member(p_staff_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
  v_deleted_at timestamptz;
begin
  select shop_id, user_id, deleted_at into v_shop_id, v_user_id, v_deleted_at
  from public.shop_staff_members where id = p_staff_member_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if v_shop_id not in (select public.current_shop_ids()) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if v_deleted_at is null then
    raise exception 'not deleted';
  end if;
  if v_deleted_at < now() - interval '30 days' then
    raise exception 'restore window expired';
  end if;

  update public.shop_staff_members set deleted_at = null where id = p_staff_member_id;
  if v_user_id is not null then
    update auth.users set banned_until = null where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.restore_staff_member(uuid) from public, anon;
grant execute on function public.restore_staff_member(uuid) to authenticated;

-- ========== locapass: パートナー(cast) ==========

create or replace function public.locapass_soft_delete_cast_member(p_cast_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
begin
  select shop_id, user_id into v_shop_id, v_user_id from public.locapass_cast_members where id = p_cast_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if not public.locapass_is_shop_admin(v_shop_id) then
    raise exception 'not authorized';
  end if;

  update public.locapass_cast_members set deleted_at = now() where id = p_cast_id;
  if v_user_id is not null then
    update auth.users set banned_until = 'infinity' where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.locapass_soft_delete_cast_member(uuid) from public, anon;
grant execute on function public.locapass_soft_delete_cast_member(uuid) to authenticated;

create or replace function public.locapass_restore_cast_member(p_cast_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
  v_deleted_at timestamptz;
begin
  select shop_id, user_id, deleted_at into v_shop_id, v_user_id, v_deleted_at
  from public.locapass_cast_members where id = p_cast_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if not public.locapass_is_shop_admin(v_shop_id) then
    raise exception 'not authorized';
  end if;
  if v_deleted_at is null then
    raise exception 'not deleted';
  end if;
  if v_deleted_at < now() - interval '30 days' then
    raise exception 'restore window expired';
  end if;

  update public.locapass_cast_members set deleted_at = null where id = p_cast_id;
  if v_user_id is not null then
    update auth.users set banned_until = null where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.locapass_restore_cast_member(uuid) from public, anon;
grant execute on function public.locapass_restore_cast_member(uuid) to authenticated;

-- ========== locapass: スタッフ ==========

create or replace function public.locapass_soft_delete_staff_member(p_staff_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
begin
  select shop_id, user_id into v_shop_id, v_user_id from public.locapass_shop_staff_members where id = p_staff_member_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if not public.locapass_is_shop_admin(v_shop_id) then
    raise exception 'not authorized';
  end if;

  update public.locapass_shop_staff_members set deleted_at = now() where id = p_staff_member_id;
  if v_user_id is not null then
    update auth.users set banned_until = 'infinity' where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.locapass_soft_delete_staff_member(uuid) from public, anon;
grant execute on function public.locapass_soft_delete_staff_member(uuid) to authenticated;

create or replace function public.locapass_restore_staff_member(p_staff_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
  v_deleted_at timestamptz;
begin
  select shop_id, user_id, deleted_at into v_shop_id, v_user_id, v_deleted_at
  from public.locapass_shop_staff_members where id = p_staff_member_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if not public.locapass_is_shop_admin(v_shop_id) then
    raise exception 'not authorized';
  end if;
  if v_deleted_at is null then
    raise exception 'not deleted';
  end if;
  if v_deleted_at < now() - interval '30 days' then
    raise exception 'restore window expired';
  end if;

  update public.locapass_shop_staff_members set deleted_at = null where id = p_staff_member_id;
  if v_user_id is not null then
    update auth.users set banned_until = null where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.locapass_restore_staff_member(uuid) from public, anon;
grant execute on function public.locapass_restore_staff_member(uuid) to authenticated;

-- ========== 一般公開ページから退店済みを隠す ==========

drop policy if exists "anon read cast of active shops" on public.cast_members;
create policy "anon read cast of active shops" on public.cast_members for select
  to anon, authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.shops s where s.id = cast_members.shop_id and s.status = 'active')
  );

drop policy if exists "anon read staff of active shops" on public.shop_staff_members;
create policy "anon read staff of active shops" on public.shop_staff_members for select
  to anon, authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.shops s where s.id = shop_staff_members.shop_id and s.status = 'active')
  );

drop policy if exists "staff members public read of active shops" on public.locapass_shop_staff_members;
create policy "staff members public read of active shops" on public.locapass_shop_staff_members for select
  to anon, authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.locapass_shops s where s.id = locapass_shop_staff_members.shop_id and s.status = 'active')
  );

create or replace view public.locapass_public_casts as
  select c.id, c.shop_id, c.name, c.age, c.sizes, c.pr_text, c.avatar_url, c.cast_code, c.created_at, c.updated_at, c.issue_no
  from public.locapass_cast_members c
  join public.locapass_shops s on s.id = c.shop_id
  where s.status = 'active' and c.deleted_at is null;

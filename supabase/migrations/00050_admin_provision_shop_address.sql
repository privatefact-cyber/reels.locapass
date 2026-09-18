-- 新規店舗発行フォーム(admin)に住所を追加できるようにする。
-- 住所はGoogleマップ連携(店舗詳細ページの地図・ルート案内ボタン)の起点になるため。

create or replace function public.admin_provision_shop(
  p_name text,
  p_area text,
  p_genre text,
  p_plan text,
  p_owner_email text,
  p_owner_password text default null,
  p_address text default null
)
returns table(shop_id uuid, login_email text, initial_password text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_plan text;
  v_login record;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'shop name is required';
  end if;

  v_plan := nullif(trim(coalesce(p_plan, '')), '');
  if v_plan is null then
    v_plan := 'standard';
  end if;
  if v_plan not in ('trial', 'standard', 'premium', 'enterprise') then
    raise exception 'invalid plan';
  end if;

  insert into public.shops (name, area, genre, plan, status, address)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_area, '')), ''),
    nullif(trim(coalesce(p_genre, '')), ''),
    v_plan,
    'active',
    nullif(trim(coalesce(p_address, '')), '')
  )
  returning id into v_shop_id;

  select * into v_login from public.admin_create_login_for_shop(v_shop_id, p_owner_email, p_owner_password);

  return query select v_shop_id, v_login.login_email, v_login.initial_password;
end;
$$;

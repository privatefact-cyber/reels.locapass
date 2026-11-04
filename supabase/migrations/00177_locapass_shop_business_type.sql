-- 店舗の「業態」(1つ)。業態は管理画面に出すもの(属性のチェックなど)を決める骨組みで、
-- 業態ごとの違いはコード側の lib/verticals/registry.ts に集める。表示の絞り込みには使わない。
-- 値は lib/verticals/registry.ts の BUSINESS_TYPES と一致させる。null は「未設定」。
alter table public.locapass_shops
  add column if not exists business_type text
  check (business_type in ('food', 'stay', 'beauty', 'activity', 'leisure', 'auto', 'retail', 'other'));

comment on column public.locapass_shops.business_type is
  '業態(food/stay/beauty/activity/leisure/auto/retail/other)。lib/verticals/registry.ts。発行後の変更はルート管理者のみ。';

-- 既存店舗の業態を、今の業種(category)から埋める。motors ポータルの店は自動車。
-- 決めきれない店(ペット業種・固定リスト外の業種など)は supabase/checks/business_type_review.sql で一覧を出して運営が確認する。
update public.locapass_shops s
set business_type = case
    when exists (select 1 from public.locapass_portals p where p.id = s.portal_id and p.slug = 'motors') then 'auto'
    when s.category in ('カフェ・スイーツ', 'レストラン・食事', '居酒屋・バー') then 'food'
    when s.category = '宿泊' then 'stay'
    when s.category = '美容・暮らし' then 'beauty'
    when s.category = '観光・体験' then 'activity'
    when s.category = 'ショッピング' then 'retail'
    else 'other'
  end
where s.business_type is null;

-- 発行後の業態の変更はルート管理者(super_admin)だけ。店舗管理者・ポータル管理者が書き換えようとしたら弾く。
-- auth.uid() が無い(マイグレーション・service role)ときは通す。変えても属性のデータは消さない(表示しないだけ)。
create or replace function public.locapass_guard_shop_business_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.business_type is distinct from old.business_type
     and auth.uid() is not null
     and not public.locapass_is_super_admin() then
    raise exception '業態の変更は運営(ルート管理者)のみ行えます';
  end if;
  return new;
end;
$$;

drop trigger if exists locapass_guard_shop_business_type on public.locapass_shops;
create trigger locapass_guard_shop_business_type
  before update of business_type on public.locapass_shops
  for each row execute function public.locapass_guard_shop_business_type();

-- 店舗の発行に業態を足す。引数を増やすと別の関数(オーバーロード)になり、
-- 名前付き引数5つの呼び出しが曖昧になるので、古いものを消してから作り直す(p_business_type は省略可)。
drop function if exists public.locapass_create_shop(bigint, text, text, text, text);

create function public.locapass_create_shop(
  p_portal_id bigint,
  p_name text,
  p_category text default null,
  p_address text default null,
  p_tel text default null,
  p_business_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not locapass_is_portal_admin(p_portal_id) then raise exception 'forbidden'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception '店舗名は必須です'; end if;
  insert into locapass_shops (portal_id, slug, name, category, address, tel, business_type, status)
  values (
    p_portal_id,
    substr(md5(gen_random_uuid()::text), 1, 10),
    trim(p_name),
    nullif(trim(coalesce(p_category, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_tel, '')), ''),
    nullif(trim(coalesce(p_business_type, '')), ''),
    'draft'
  )
  returning id into v_id;
  return v_id;
end;
$$;

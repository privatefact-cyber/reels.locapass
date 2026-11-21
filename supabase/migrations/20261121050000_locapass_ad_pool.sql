-- 広告カードの選び方を、データベース側に移す。
--  - 閲覧者の現在地が配信範囲(radius_km)に入る店を優先し、1つも無ければ全体から選ぶ。
--  - 直近(昨日〜今日)の表示が少ない店を優先して出す(公平な配信)。同じくらいなら、ランダム。
--  - 取得する件数に上限(以前は60枚/200店)が無い。候補は、データベース側で絞ってから返す。
-- サーバー側(service_role)だけが呼べる。

create index if not exists locapass_ad_events_creative_day_imp_idx
  on public.locapass_ad_events (creative, day) where kind = 'imp';

create or replace function public.locapass_ad_pool(
  p_exclude_shop uuid,
  p_lat double precision,
  p_lng double precision,
  p_limit integer default 4
)
returns table (card_id uuid, auto_shop_id uuid, in_range boolean)
language sql
volatile
security definer
set search_path = public
as $$
  with owned as (
    select distinct shop_id
    from locapass_ad_cards
    where shop_id is not null and status = 'approved' and is_active
      and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
  ),
  cand as (
    select c.id as card_id, null::uuid as auto_shop_id, s.lat, s.lng, c.radius_km::double precision as radius, 'ad:' || c.id::text as key
    from locapass_ad_cards c
    join locapass_shops s on s.id = c.shop_id
    where c.shop_id is not null and c.status = 'approved' and c.is_active
      and (c.starts_at is null or c.starts_at <= now()) and (c.ends_at is null or c.ends_at > now())
      and s.ad_option_enabled and s.status = 'active' and s.plan not in ('free', 'lite')
      and s.id <> p_exclude_shop
    union all
    select null::uuid, s.id, s.lat, s.lng, 10.0::double precision, 'auto:' || s.id::text
    from locapass_shops s
    where s.ad_option_enabled and s.status = 'active' and s.plan not in ('free', 'lite')
      and s.id <> p_exclude_shop
      and not exists (select 1 from owned o where o.shop_id = s.id)
  ),
  geo as (
    select cand.*,
      case when p_lat is null or p_lng is null or lat is null or lng is null then null
      else 2 * 6371 * asin(sqrt(least(1, power(sin(radians(p_lat - lat) / 2), 2)
             + cos(radians(lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - lng) / 2), 2)))) end as dist
    from cand
  ),
  flag as (select geo.*, (dist is not null and dist <= radius) as in_range from geo),
  pool as (
    select * from flag where in_range
    union all
    select * from flag where not exists (select 1 from flag f2 where f2.in_range)
  ),
  sampled as (select * from pool order by random() limit 300),
  scored as (
    select s.*, (
      select count(*) from locapass_ad_events e
      where e.kind = 'imp' and e.creative = s.key and e.day >= ((now() at time zone 'Asia/Tokyo')::date - 1)
    ) as imp
    from sampled s
  )
  select card_id, auto_shop_id, in_range
  from scored
  order by (imp + 1) * (0.7 + 0.6 * random())
  limit greatest(p_limit, 0);
$$;

revoke all on function public.locapass_ad_pool(uuid, double precision, double precision, integer) from public, anon, authenticated;
grant execute on function public.locapass_ad_pool(uuid, double precision, double precision, integer) to service_role;

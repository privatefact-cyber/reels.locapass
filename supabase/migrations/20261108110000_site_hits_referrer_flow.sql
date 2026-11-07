-- 流入元ごとの「着地ページ・その後に見たページ・1訪問あたりのPV」の集計(アクセス解析の「外部流入別の動き」用)。
-- テーブルの変更は無し。1訪問 = 同じ日・同じ訪問者(vid は日替わりの匿名ハッシュなので、日をまたぐ訪問は別に数える)。
-- 流入元(ref_host)は、タブを開いて最初に見たページにだけ記録される(SiteHitBeacon)ので、
-- 訪問の最初のヒットを「着地ページ」、その流入元を「その訪問の流入元」とみなす。
-- p_ref: null=外部流入すべて(直接アクセス以外) / '__direct__'=直接・ブックマーク等 / それ以外=そのホストだけ。
create or replace function public.site_hits_referrer_flow(p_site text, p_since date, p_ref text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with h as (
    select day, vid, path, ref_host,
           row_number() over (partition by day, vid order by created_at, id) as n
    from public.site_hits where site = p_site and day >= p_since
  ),
  s as (
    select day, vid,
           max(path) filter (where n = 1) as landing,
           max(ref_host) filter (where n = 1) as ref,
           count(*) as pv
    from h group by day, vid
  ),
  sel as (
    select * from s
    where case when p_ref is null then ref <> '' when p_ref = '__direct__' then ref = '' else ref = p_ref end
  )
  select jsonb_build_object(
    'sessions', (select count(*) from s),
    'refs', coalesce((select jsonb_agg(r order by r.sessions desc) from (
      select case when ref = '' then '__direct__' else ref end as host,
             count(*) as sessions, sum(pv) as pv, round(avg(pv), 1) as avg_pv,
             round(100.0 * count(*) filter (where pv = 1) / count(*)) as bounce_pct
      from s group by ref order by 2 desc limit 15) r), '[]'::jsonb),
    'landings', coalesce((select jsonb_agg(r order by r.sessions desc) from (
      select landing as path, count(*) as sessions, round(avg(pv), 1) as avg_pv
      from sel group by landing order by 2 desc limit 10) r), '[]'::jsonb),
    'next_pages', coalesce((select jsonb_agg(r order by r.pv desc) from (
      select h.path, count(*) as pv
      from h join sel on sel.day = h.day and sel.vid = h.vid
      where h.n > 1 group by h.path order by 2 desc limit 10) r), '[]'::jsonb),
    'pv_dist', coalesce((select jsonb_agg(r order by r.ord) from (
      select case when pv = 1 then 1 when pv = 2 then 2 when pv <= 5 then 3 else 4 end as ord,
             case when pv = 1 then '1ページ' when pv = 2 then '2ページ' when pv <= 5 then '3〜5ページ' else '6ページ以上' end as label,
             count(*) as sessions
      from sel group by 1, 2) r), '[]'::jsonb)
  );
$$;
revoke all on function public.site_hits_referrer_flow(text, date, text) from public, anon, authenticated;
grant execute on function public.site_hits_referrer_flow(text, date, text) to service_role;

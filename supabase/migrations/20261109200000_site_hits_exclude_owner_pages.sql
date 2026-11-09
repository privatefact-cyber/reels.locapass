-- アクセス解析の「訪問者」から、店舗・運営側の画面(ログイン・店舗ダッシュボード・マイページ・動作確認用ページ)を除く。
-- 消費者の訪問だけを数えるため。site_hits の行は消さず、集計の段階で除外する(LOCAPASS と LUXELA で共通)。
create or replace function public.site_hits_is_owner_path(p text)
returns boolean
language sql
immutable
as $$
  select p ~ '^(/(en|zh|ar))?/(dashboard|mypage|login|auth|shop-recover|agent|admin|tmp-[^/]*|dev-[^/]*|zz-[^/]*)(/|$)'
$$;

create or replace function public.site_hits_summary(p_site text, p_since date, p_pref text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with h as (select * from public.site_hits where site = p_site and day >= p_since and not public.site_hits_is_owner_path(path)),
  hp as (select * from h where p_pref is null or pref_code = p_pref)
  select jsonb_build_object(
    'pv', (select count(*) from h),
    'uv', (select count(distinct (day, vid)) from h),
    'prefs', coalesce((select jsonb_agg(r order by r.uv desc, r.pv desc) from (
      select pref_code, count(*) pv, count(distinct (day, vid)) uv from h
      where country = 'JP' and pref_code <> '' group by pref_code) r), '[]'::jsonb),
    'overseas', coalesce((select jsonb_agg(r order by r.uv desc) from (
      select country, count(distinct (day, vid)) uv from h
      where country <> '' and country <> 'JP' group by country order by 2 desc limit 10) r), '[]'::jsonb),
    'unknown', (select count(distinct (day, vid)) from h where country = '' or (country = 'JP' and pref_code = '')),
    'daily', coalesce((select jsonb_agg(r order by r.day) from (
      select day, count(*) pv, count(distinct vid) uv from h group by day) r), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(r) from (
      select path, count(*) pv from hp group by path order by 2 desc limit 10) r), '[]'::jsonb),
    'refs', coalesce((select jsonb_agg(r) from (
      select case when ref_host = '' then '(直接・ブックマーク等)' else ref_host end as host, count(*) pv
      from hp group by 1 order by 2 desc limit 10) r), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(r) from (
      select device, count(*) pv from hp group by device order by 2 desc) r), '[]'::jsonb)
  );
$$;

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
    from public.site_hits where site = p_site and day >= p_since and not public.site_hits_is_owner_path(path)
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

revoke all on function public.site_hits_summary(text, date, text) from public, anon, authenticated;
grant execute on function public.site_hits_summary(text, date, text) to service_role;
revoke all on function public.site_hits_referrer_flow(text, date, text) from public, anon, authenticated;
grant execute on function public.site_hits_referrer_flow(text, date, text) to service_role;

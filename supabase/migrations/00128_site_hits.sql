-- サイト全体のアクセス解析(都道府県別)。luxela.jp と locapass.net が同じDBを共有するので site 列で区別する。
-- IPアドレスは保存しない。vid は「IP+UA+日付」の日替わり匿名ハッシュ(日をまたいで追跡できない)。
-- 書き込みも読み取りもサーバー(service role)のみ。anon/authenticatedには一切開放しない。
create table if not exists public.site_hits (
  id bigint generated always as identity primary key,
  site text not null check (site in ('luxela', 'locapass')),
  day date not null default ((now() at time zone 'Asia/Tokyo')::date),
  created_at timestamptz not null default now(),
  country text not null default '',
  pref_code text not null default '',   -- 日本のみ。'01'〜'47'(JIS X 0401)
  path text not null,
  ref_host text not null default '',
  device text not null default 'desktop' check (device in ('mobile', 'tablet', 'desktop')),
  vid text not null
);
create index if not exists site_hits_site_day_idx on public.site_hits (site, day);
create index if not exists site_hits_site_pref_idx on public.site_hits (site, pref_code, day);

alter table public.site_hits enable row level security;
revoke all on public.site_hits from anon, authenticated;

-- 集計をまとめて返す。service role 専用(管理画面のサーバー側から呼ぶ)。
create or replace function public.site_hits_summary(p_site text, p_since date, p_pref text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with h as (select * from public.site_hits where site = p_site and day >= p_since),
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
revoke all on function public.site_hits_summary(text, date, text) from public, anon, authenticated;
grant execute on function public.site_hits_summary(text, date, text) to service_role;

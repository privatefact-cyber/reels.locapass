-- 店舗詳細の「電話・LINEで連絡」ボタンのタップ数を記録し、店舗ダッシュボードで
-- 「ポータル経由の問い合わせ数」として見せるための集計テーブル。
-- 押した人は特定しない匿名集計(viewer_idやIPは持たない)。実際の通話・友だち追加の成立数ではなく「タップ数」。
create table if not exists public.locapass_shop_contact_taps (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  kind text not null check (kind in ('phone', 'line', 'line_qr')),
  created_at timestamptz not null default now()
);
create index if not exists idx_locapass_shop_contact_taps_shop
  on public.locapass_shop_contact_taps (shop_id, created_at desc);

-- 直接のselect/insertは誰にも許可しない(RPC経由のみ)。
alter table public.locapass_shop_contact_taps enable row level security;

create or replace function public.locapass_record_contact_tap(p_shop_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('phone', 'line', 'line_qr') then
    return;
  end if;
  insert into locapass_shop_contact_taps (shop_id, kind)
  select s.id, p_kind from locapass_shops s where s.id = p_shop_id and s.status = 'active';
end;
$$;
revoke all on function public.locapass_record_contact_tap(uuid, text) from public;
grant execute on function public.locapass_record_contact_tap(uuid, text) to anon, authenticated;

-- 店舗管理者(と上位権限)だけが自店舗の集計を見られる。権限が無ければ0行。
create or replace function public.locapass_contact_tap_stats(p_shop_id uuid)
returns table (kind text, taps_7d bigint, taps_30d bigint)
language sql stable security definer set search_path = public as $$
  select t.kind,
         count(*) filter (where t.created_at >= now() - interval '7 days'),
         count(*)
  from locapass_shop_contact_taps t
  where t.shop_id = p_shop_id
    and t.created_at >= now() - interval '30 days'
    and locapass_is_shop_admin(p_shop_id)
  group by t.kind;
$$;
revoke all on function public.locapass_contact_tap_stats(uuid) from public;
grant execute on function public.locapass_contact_tap_stats(uuid) to authenticated;

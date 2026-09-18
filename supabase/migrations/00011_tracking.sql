-- 動態監視 & SOS通報システム
--
-- キャスト(現場)の位置情報リアルタイム送信 + SOS通報 + 対応要員(shop_staff)の
-- 現在地・対応可否管理。将来的に動態記録を信用スコア計算へ組み込む構想があるため、
-- 現在地(cast_locations)とは別に履歴(cast_location_pings)を追記専用で残す。
--
-- キャストは shop_staff と異なり auth.users アカウントを持たない(現場スタッフに
-- ログインアカウントを都度発行する運用コストを避けるため)。代わりに cast_members に
-- 推測不可能な field_token を1つ発行し、その場限りのURL(マジックリンク)経由で
-- 匿名(anon)のまま位置情報・SOSを送信できるようにする。field_token 自体は
-- 既存の「authenticated full access own cast」ポリシーにより自店舗staffのみ参照可能
-- (新規ポリシーは不要)。

alter table public.cast_members
  add column field_token uuid not null default gen_random_uuid() unique,
  add column is_demo boolean not null default false;

-- =========================================================
-- 1. cast_locations (現在地: 1キャスト1行)
-- =========================================================
create table public.cast_locations (
  cast_id uuid primary key references public.cast_members (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  lat double precision,
  lng double precision,
  accuracy double precision,
  is_on_duty boolean not null default false,
  sos_active boolean not null default false,
  updated_at timestamptz not null default now()
);

create index idx_cast_locations_shop_id on public.cast_locations (shop_id);

-- =========================================================
-- 2. cast_location_pings (移動軌跡ログ、追記専用)
--
-- ルート描画・走行距離集計・将来の信用スコア用データソース。
-- =========================================================
create table public.cast_location_pings (
  id bigint generated always as identity primary key,
  cast_id uuid not null references public.cast_members (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);

create index idx_cast_location_pings_cast_recorded on public.cast_location_pings (cast_id, recorded_at);

-- =========================================================
-- 3. staff_locations (対応要員の現在地・対応可否)
--
-- shop_staff は既に auth.users アカウントを持つため field_token は不要、
-- 本人の authenticated セッションでそのまま更新できる。
-- =========================================================
create table public.staff_locations (
  shop_staff_id uuid primary key references public.shop_staff (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  lat double precision,
  lng double precision,
  is_available boolean not null default false,
  updated_at timestamptz not null default now()
);

create index idx_staff_locations_shop_id on public.staff_locations (shop_id);

-- =========================================================
-- 4. sos_events (SOS発報履歴)
--
-- 発報のたびに1行追加する(cast_locations.sos_active はあくまで「現在進行中か」の
-- フラグで、履歴自体はこちらに残す)。
-- =========================================================
create table public.sos_events (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.cast_members (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  status text not null default 'active' check (status in ('active', 'acknowledged', 'resolved')),
  responder_staff_id uuid references public.shop_staff (id),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

create index idx_sos_events_shop_id_status on public.sos_events (shop_id, status);

alter table public.cast_locations enable row level security;
alter table public.cast_location_pings enable row level security;
alter table public.staff_locations enable row level security;
alter table public.sos_events enable row level security;

-- ---- cast_locations / cast_location_pings: 閲覧は自店舗staffのみ ----
create policy "authenticated read own shop cast locations"
  on public.cast_locations for select
  to authenticated
  using (shop_id in (select public.current_shop_ids()) or public.is_platform_admin());

create policy "authenticated read own shop location pings"
  on public.cast_location_pings for select
  to authenticated
  using (shop_id in (select public.current_shop_ids()) or public.is_platform_admin());

-- ---- sos_events: 閲覧・状態更新は自店舗staffのみ ----
create policy "authenticated read own shop sos events"
  on public.sos_events for select
  to authenticated
  using (shop_id in (select public.current_shop_ids()) or public.is_platform_admin());

create policy "authenticated update own shop sos events"
  on public.sos_events for update
  to authenticated
  using (shop_id in (select public.current_shop_ids()))
  with check (shop_id in (select public.current_shop_ids()));

-- ---- staff_locations: 閲覧は自店舗staff、更新は本人のみ ----
create policy "authenticated read own shop staff locations"
  on public.staff_locations for select
  to authenticated
  using (shop_id in (select public.current_shop_ids()) or public.is_platform_admin());

create policy "authenticated upsert own staff location"
  on public.staff_locations for all
  to authenticated
  using (shop_staff_id in (select id from public.shop_staff where user_id = auth.uid()))
  with check (
    shop_staff_id in (select id from public.shop_staff where user_id = auth.uid())
    and shop_id in (select public.current_shop_ids())
  );

-- =========================================================
-- field_token 経由のRPC群(anon実行可)
--
-- キャスト本人のスマホには一切ログイン機能を持たせない設計のため、
-- ここだけは例外的に anon ロールへ execute を許可する。
-- SECURITY DEFINER でRLSをバイパスするが、field_token が一致しない限り
-- 何も更新できないため、実質的に field_token そのものが認証情報として機能する
-- (URLを知る=本人、という運用。トークンの再発行手段は今後必要になれば追加する)。
-- =========================================================

create or replace function public.submit_cast_location(
  p_field_token uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast_id uuid;
  v_shop_id uuid;
begin
  select id, shop_id into v_cast_id, v_shop_id
  from public.cast_members
  where field_token = p_field_token;

  if v_cast_id is null then
    raise exception 'invalid field token';
  end if;

  insert into public.cast_locations (cast_id, shop_id, lat, lng, accuracy, is_on_duty, updated_at)
  values (v_cast_id, v_shop_id, p_lat, p_lng, p_accuracy, true, now())
  on conflict (cast_id) do update set
    lat = excluded.lat,
    lng = excluded.lng,
    accuracy = excluded.accuracy,
    is_on_duty = true,
    updated_at = now();

  insert into public.cast_location_pings (cast_id, shop_id, lat, lng)
  values (v_cast_id, v_shop_id, p_lat, p_lng);
end;
$$;

revoke all on function public.submit_cast_location(uuid, double precision, double precision, double precision) from public;
grant execute on function public.submit_cast_location(uuid, double precision, double precision, double precision) to anon, authenticated;

create or replace function public.submit_cast_sos(
  p_field_token uuid,
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast_id uuid;
  v_shop_id uuid;
begin
  select id, shop_id into v_cast_id, v_shop_id
  from public.cast_members
  where field_token = p_field_token;

  if v_cast_id is null then
    raise exception 'invalid field token';
  end if;

  insert into public.cast_locations (cast_id, shop_id, lat, lng, is_on_duty, sos_active, updated_at)
  values (v_cast_id, v_shop_id, p_lat, p_lng, true, true, now())
  on conflict (cast_id) do update set
    lat = excluded.lat,
    lng = excluded.lng,
    sos_active = true,
    updated_at = now();

  insert into public.sos_events (cast_id, shop_id, lat, lng)
  values (v_cast_id, v_shop_id, p_lat, p_lng);
end;
$$;

revoke all on function public.submit_cast_sos(uuid, double precision, double precision) from public;
grant execute on function public.submit_cast_sos(uuid, double precision, double precision) to anon, authenticated;

create or replace function public.set_cast_duty(
  p_field_token uuid,
  p_is_on_duty boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast_id uuid;
  v_shop_id uuid;
begin
  select id, shop_id into v_cast_id, v_shop_id
  from public.cast_members
  where field_token = p_field_token;

  if v_cast_id is null then
    raise exception 'invalid field token';
  end if;

  insert into public.cast_locations (cast_id, shop_id, is_on_duty, updated_at)
  values (v_cast_id, v_shop_id, p_is_on_duty, now())
  on conflict (cast_id) do update set
    is_on_duty = p_is_on_duty,
    sos_active = case when p_is_on_duty then public.cast_locations.sos_active else false end,
    updated_at = now();
end;
$$;

revoke all on function public.set_cast_duty(uuid, boolean) from public;
grant execute on function public.set_cast_duty(uuid, boolean) to anon, authenticated;

-- SOS解除(対応staffがダッシュボードから操作。自店舗分のみ許可)。
create or replace function public.resolve_sos(p_sos_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_cast_id uuid;
begin
  select shop_id, cast_id into v_shop_id, v_cast_id
  from public.sos_events
  where id = p_sos_event_id;

  if v_shop_id is null or v_shop_id not in (select public.current_shop_ids()) then
    raise exception 'not authorized';
  end if;

  update public.sos_events
  set status = 'resolved', resolved_at = now()
  where id = p_sos_event_id;

  update public.cast_locations
  set sos_active = false
  where cast_id = v_cast_id;
end;
$$;

revoke all on function public.resolve_sos(uuid) from public;
grant execute on function public.resolve_sos(uuid) to authenticated;

-- ダッシュボードのマーカー・SOSアラートに必須のRealtime配信。
alter publication supabase_realtime add table public.cast_locations;
alter publication supabase_realtime add table public.sos_events;
alter publication supabase_realtime add table public.staff_locations;

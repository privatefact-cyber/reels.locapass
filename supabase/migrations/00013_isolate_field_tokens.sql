-- field_token を cast_members から分離する。
--
-- cast_members には既に「anon read cast of active shops」ポリシーがあり、
-- (行単位ではなく)該当行の全カラムをanonへ公開する設計になっている。
-- 00011でfield_tokenをcast_membersに追加したままだと、anon(公開APIキー)から
-- `select=field_token` を投げるだけで全キャストのトークンを一括収集でき、
-- 他人になりすましてGPS送信・SOS誤発報ができてしまう重大な穴になる。
--
-- blacklistsテーブルと同様、anonポリシーを一切持たない専用テーブルへ切り出して隔離する。

create table public.cast_field_tokens (
  cast_id uuid primary key references public.cast_members (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now()
);

alter table public.cast_field_tokens enable row level security;

-- anon向けポリシーは意図的に作成しない = anonからは完全にアクセス不可。
create policy "authenticated read own shop field tokens"
  on public.cast_field_tokens for select
  to authenticated
  using (shop_id in (select public.current_shop_ids()) or public.is_platform_admin());

-- 既存キャストのトークンを引き継ぎつつ移行。
insert into public.cast_field_tokens (cast_id, shop_id, token)
select id, shop_id, field_token from public.cast_members;

alter table public.cast_members drop column field_token;

-- 新規キャスト登録時に自動でトークンを発行する(手動INSERT漏れを防ぐ)。
create or replace function public.create_cast_field_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cast_field_tokens (cast_id, shop_id)
  values (new.id, new.shop_id);
  return new;
end;
$$;

revoke all on function public.create_cast_field_token() from public;
revoke execute on function public.create_cast_field_token() from anon;
revoke execute on function public.create_cast_field_token() from authenticated;

create trigger trg_cast_members_create_field_token
  after insert on public.cast_members
  for each row
  execute function public.create_cast_field_token();

-- RPC群を cast_field_tokens 参照に切り替え。
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
  select cast_id, shop_id into v_cast_id, v_shop_id
  from public.cast_field_tokens
  where token = p_field_token;

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
  select cast_id, shop_id into v_cast_id, v_shop_id
  from public.cast_field_tokens
  where token = p_field_token;

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
  select cast_id, shop_id into v_cast_id, v_shop_id
  from public.cast_field_tokens
  where token = p_field_token;

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

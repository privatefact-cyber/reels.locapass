-- リールのインサイト用イベント記録(投稿者だけが見られる)。
--   view       : そのリールが画面で1秒以上表示された(閲覧者×日で重複を除く)
--   engaged    : 5秒以上表示された(「しっかり見られた」)
--   tag_search : 訪問者が動画ストックでタグを選んで探した(店舗/キャスト単位。reel_idは持たない)
-- 書き込みは record_event(RPC)だけ。直接のINSERTは誰にも許さない。投稿者本人・店舗スタッフの閲覧は数えない。
-- 読み取りは、そのリールの投稿者(キャスト/スタッフ)と店舗の管理者だけ(RLS)。閲覧者IDはブラウザごとのランダムUUIDで個人は特定しない。

create table if not exists public.locapass_reel_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('view', 'engaged', 'tag_search')),
  reel_id uuid references public.locapass_reels(id) on delete cascade,
  -- 記録時点の持ち主(RLSと集計を単純にするため)
  shop_id uuid,
  cast_id uuid,
  staff_id uuid,
  tag text,
  viewer_id uuid not null,
  day date not null default ((now() at time zone 'Asia/Tokyo')::date),
  created_at timestamptz not null default now(),
  check ((event_type = 'tag_search') = (tag is not null)),
  check ((event_type = 'tag_search') or reel_id is not null)
);

-- 同じ閲覧者・同じ対象・同じ日のイベントは1件だけ(連打や再表示で水増しされない)。
create unique index if not exists locapass_reel_events_dedupe_idx on public.locapass_reel_events (
  event_type, coalesce(reel_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(shop_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(cast_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(tag, ''), viewer_id, day
);
create index if not exists locapass_reel_events_reel_idx on public.locapass_reel_events (reel_id, event_type);
create index if not exists locapass_reel_events_shop_idx on public.locapass_reel_events (shop_id, event_type, created_at desc);
create index if not exists locapass_reel_events_cast_idx on public.locapass_reel_events (cast_id, event_type, created_at desc);

alter table public.locapass_reel_events enable row level security;
revoke all on public.locapass_reel_events from anon, authenticated;
grant select on public.locapass_reel_events to authenticated;

create policy "owners read reel events" on public.locapass_reel_events
  for select to authenticated
  using ((cast_id is not null and cast_id = public.locapass_current_cast_id())
    or (staff_id is not null and staff_id = public.locapass_current_staff_member_id())
    or (shop_id is not null and public.locapass_is_shop_staff(shop_id)));

create or replace function public.locapass_record_event(
  p_type text, p_reel_id uuid, p_shop_id uuid, p_cast_id uuid, p_tag text, p_viewer uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
  v_cast uuid;
  v_staff uuid;
begin
  if p_viewer is null then return; end if;

  if p_type in ('view', 'engaged') then
    select shop_id, cast_id, posted_by_staff_id into v_shop, v_cast, v_staff
    from public.locapass_reels
    where id = p_reel_id and status = 'publish' and reel_type = 'permanent';
    if not found then return; end if;
  elsif p_type = 'tag_search' then
    if p_tag is null or p_tag !~ '^[a-z]{2,20}$' then return; end if;
    if p_cast_id is not null then
      select shop_id into v_shop from public.locapass_cast_members where id = p_cast_id;
      if not found then return; end if;
      v_cast := p_cast_id;
    elsif p_shop_id is not null then
      perform 1 from public.locapass_shops where id = p_shop_id;
      if not found then return; end if;
      v_shop := p_shop_id;
    else
      return;
    end if;
  else
    return;
  end if;

  -- 投稿者本人・店舗スタッフが自分の動画/店を見た分は数えない(インサイトが自分のアクセスで膨らまないように)。
  if auth.uid() is not null and ((v_cast is not null and v_cast = public.locapass_current_cast_id())
    or (v_staff is not null and v_staff = public.locapass_current_staff_member_id())
    or (v_shop is not null and public.locapass_is_shop_staff(v_shop))) then
    return;
  end if;

  begin
    insert into public.locapass_reel_events (event_type, reel_id, shop_id, cast_id, staff_id, tag, viewer_id)
    values (
      p_type,
      case when p_type = 'tag_search' then null else p_reel_id end,
      v_shop, v_cast, v_staff,
      case when p_type = 'tag_search' then p_tag end,
      p_viewer
    );
  exception when unique_violation then
    null;
  end;
end;
$$;

revoke all on function public.locapass_record_event(text, uuid, uuid, uuid, text, uuid) from public;
grant execute on function public.locapass_record_event(text, uuid, uuid, uuid, text, uuid) to anon, authenticated;

-- リールごとの閲覧者数/しっかり見た人数。RLSが効くので、自分が見られるリール分しか返らない。
create or replace function public.locapass_reel_stats(p_reel_ids uuid[])
returns table (reel_id uuid, viewers bigint, engaged bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select e.reel_id,
         count(distinct e.viewer_id) filter (where e.event_type = 'view'),
         count(distinct e.viewer_id) filter (where e.event_type = 'engaged')
  from public.locapass_reel_events e
  where e.reel_id = any (p_reel_ids)
  group by e.reel_id
$$;

-- 動画ストックでタグを選んで探された回数(店舗単位、またはキャスト単位)。
create or replace function public.locapass_tag_search_stats(p_shop_id uuid default null, p_cast_id uuid default null)
returns table (tag text, searches bigint, viewers bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select e.tag, count(*), count(distinct e.viewer_id)
  from public.locapass_reel_events e
  where e.event_type = 'tag_search'
    and ((p_cast_id is not null and e.cast_id = p_cast_id)
      or (p_cast_id is null and p_shop_id is not null and e.shop_id = p_shop_id and e.cast_id is null))
  group by e.tag
$$;

-- 計測を始めた日時(これより前の閲覧は記録されていない、とインサイト画面で断るため)。個人情報ではないので誰でも読める。
create or replace function public.locapass_tracking_started_at()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select min(created_at) from public.locapass_reel_events
$$;

revoke all on function public.locapass_reel_stats(uuid[]) from public;
revoke all on function public.locapass_tag_search_stats(uuid, uuid) from public;
revoke all on function public.locapass_tracking_started_at() from public;
grant execute on function public.locapass_reel_stats(uuid[]) to authenticated;
grant execute on function public.locapass_tag_search_stats(uuid, uuid) to authenticated;
grant execute on function public.locapass_tracking_started_at() to authenticated;

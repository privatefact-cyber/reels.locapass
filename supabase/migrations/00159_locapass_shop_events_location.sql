-- 移動販売(Caravan)の「今日の出店」用に、イベントへ位置(任意)を足す。
-- 位置つきイベントは、開始〜終了の間だけ、その店のピンとして地図に出る(lib/map/liveSpots.ts)。
-- 公開の読み取りポリシーは既存のまま(新しいテーブル・ポリシーは作らない)。

alter table public.locapass_shop_events
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists address text;

alter table public.locapass_shop_events
  drop constraint if exists locapass_shop_events_location_check;
alter table public.locapass_shop_events
  add constraint locapass_shop_events_location_check check (
    (lat is null and lng is null)
    or (lat between -90 and 90 and lng between -180 and 180)
  );

create index if not exists locapass_shop_events_live_spot_idx
  on public.locapass_shop_events (starts_at, ends_at)
  where lat is not null;

-- Caravanのポータルだけ、管理画面に「今日の出店」を出す。
update public.locapass_portals set features = array['mobile'] where slug = 'caravan' and not (features @> array['mobile']);

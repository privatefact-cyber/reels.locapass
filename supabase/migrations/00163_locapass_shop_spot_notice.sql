-- 店舗オプション「開催場所のお知らせ」(譲渡会・イベントなど)。既定はオフ。
-- オンにした店は、管理画面に開催予定の登録(位置つきイベント。locapass_shop_events の lat/lng)が出て、
-- 店舗ページの「次の開催」カード・カレンダーと、地図のピンに出る。移動販売(ポータルの features='mobile')は従来どおり別扱い。
alter table public.locapass_shops add column if not exists spot_notice_enabled boolean not null default false;

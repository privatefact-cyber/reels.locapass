-- 店舗情報の鮮度管理。「閉店かどうか」を断定せず、最後に確認できた日を持つ。
--  last_confirmed_at/source: 公式URLの応答・リール投稿など、営業の気配を確認できた最新日時とその根拠
--  url_status: 公式URL(url)の死活。unchecked / ok / dead / error(一時的な失敗)。dead は連続失敗が閾値を超えたときだけ
--  url_fail_count: 連続失敗回数(成功で0に戻る)
alter table public.locapass_shops
  add column if not exists last_confirmed_at timestamptz,
  add column if not exists last_confirmed_source text,
  add column if not exists url_status text not null default 'unchecked',
  add column if not exists url_checked_at timestamptz,
  add column if not exists url_fail_count integer not null default 0;

alter table public.locapass_shops
  drop constraint if exists locapass_shops_url_status_check;
alter table public.locapass_shops
  add constraint locapass_shops_url_status_check
  check (url_status in ('unchecked', 'ok', 'dead', 'error'));

comment on column public.locapass_shops.last_confirmed_at is '営業の気配を最後に確認できた日時(URL応答・リール投稿など)。古いピンの表示順を下げる判断に使う';
comment on column public.locapass_shops.last_confirmed_source is 'last_confirmed_at の根拠: url / reel / manual';
comment on column public.locapass_shops.url_status is '公式URLの死活: unchecked / ok / dead / error';

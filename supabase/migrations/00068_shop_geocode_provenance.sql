-- 店舗座標の「出どころ」を記録する。
--
-- 00066でエリア中心+ランダムずれの仮値を入れたため、今DBにある座標は
-- 「実住所から求めたもの」と「仮置き」が混ざっている。どちらなのかが分からないと、
-- 一括ジオコーディングが手動で直した座標を上書きしてしまう。
--
--   address      … 住所をジオコーディングして得た正規の座標
--   area_fallback… エリア中心+ジッターの仮値(00066で入れたもの)
--   manual       … 管理画面でピンをドラッグ/住所検索して人が確定させたもの(最優先・上書き禁止)
alter table public.shops
  add column if not exists geocode_source text
    check (geocode_source is null or geocode_source in ('address', 'area_fallback', 'manual')),
  add column if not exists geocoded_at timestamptz;

-- 既存の座標は全て00066で入れた仮値なので、そう印を付ける。
update public.shops
set geocode_source = 'area_fallback'
where lat is not null and lng is not null and geocode_source is null;

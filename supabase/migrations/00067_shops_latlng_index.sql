-- マップは「表示範囲(bbox)で絞って取得する」方式なので、lat/lngの範囲検索が主クエリになる。
-- 掲載店舗を数千件規模まで増やす前提のため、座標に複合インデックスを張っておく。
-- active かつ座標ありの行しか地図には出ないので部分インデックスにする。
create index if not exists idx_shops_lat_lng
  on public.shops (lat, lng)
  where status = 'active' and lat is not null and lng is not null;

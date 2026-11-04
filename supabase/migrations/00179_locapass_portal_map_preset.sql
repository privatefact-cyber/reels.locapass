-- 地図は全国で1系統(/map)にし、ポータルによる表示の絞り込みはしない(所属は「権利」だけ)。
-- ポータルの地図は「全国地図をこの初期設定で開く」(/map?preset={ポータルのslug})。
-- 中身: { "center": [lng, lat], "zoom": 数値, "layers": { "pet": bool, "now": bool } }
--   layers は地図のスイッチ(🐾・今)を最初からオンにするか。読み取りは lib/map/mapPreset.ts(不正な値は無視する)。
-- null のポータルは、所属店舗が収まる範囲で開く(店舗も無ければ、通常の /map と同じ)。
alter table public.locapass_portals
  add column if not exists map_preset jsonb
  check (map_preset is null or jsonb_typeof(map_preset) = 'object');

comment on column public.locapass_portals.map_preset is
  '地図の初期設定 {center:[lng,lat], zoom, layers:{pet,now}}。/map?preset={slug} で使う。表示の絞り込みには使わない。';

-- 公開中のポータルの初期値(2026-11-05時点の所属店舗の分布から)。
update public.locapass_portals set map_preset = '{"center": [140.4647, 36.3755], "zoom": 13, "layers": {"pet": false, "now": false}}' where slug = 'mito' and map_preset is null;
update public.locapass_portals set map_preset = '{"center": [140.5784, 36.3119], "zoom": 14, "layers": {"pet": false, "now": false}}' where slug = 'oarai' and map_preset is null;
update public.locapass_portals set map_preset = '{"center": [140.2, 36.3], "zoom": 9, "layers": {"pet": true, "now": false}}' where slug = 'lizand' and map_preset is null;
update public.locapass_portals set map_preset = '{"center": [139.9, 35.88], "zoom": 9, "layers": {"pet": false, "now": false}}' where slug = 'motors' and map_preset is null;
update public.locapass_portals set map_preset = '{"center": [139.575, 35.45], "zoom": 11, "layers": {"pet": false, "now": false}}' where slug = 'yokohama' and map_preset is null;
update public.locapass_portals set map_preset = '{"center": [139.7005, 35.6595], "zoom": 14, "layers": {"pet": false, "now": false}}' where slug = 'shibuya' and map_preset is null;
update public.locapass_portals set map_preset = '{"center": [139.7069, 35.6635], "zoom": 13, "layers": {"pet": false, "now": false}}' where slug = 'hb' and map_preset is null;
update public.locapass_portals set map_preset = '{"center": [139.7017, 35.6646], "zoom": 14, "layers": {"pet": false, "now": false}}' where slug = 'caravan' and map_preset is null;

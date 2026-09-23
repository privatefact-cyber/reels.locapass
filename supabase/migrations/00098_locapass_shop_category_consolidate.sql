-- 業種(locapass_shops.category)を固定10種類に集約する。
-- 自由入力のままだと表記ゆれ(カフェ/カフェ・スイーツ/ドッグカフェ…)でフィードや地図のタグが増え続けるため。
-- 新しい選択肢は lib/shop/locapassCategories.ts と同じ値。「公式」(運営事務局の公式店舗)とNULLはそのまま残す。
-- 元の値は locapass_shops_category_backup_20260924 に退避してあるので、戻す場合はそこから復元する。
create table if not exists public.locapass_shops_category_backup_20260924 as
  select id, category from public.locapass_shops;
alter table public.locapass_shops_category_backup_20260924 enable row level security;

update public.locapass_shops s
set category = case s.category
  when 'カフェ' then 'カフェ・スイーツ'
  when 'カフェ・スイーツ' then 'カフェ・スイーツ'
  when 'ブックカフェ' then 'カフェ・スイーツ'
  when 'ベーカリー' then 'カフェ・スイーツ'
  when 'ベーカリーカフェ' then 'カフェ・スイーツ'
  when 'アートカフェ・ギャラリー' then 'カフェ・スイーツ'
  when 'コンセプトカフェ' then 'カフェ・スイーツ'
  when 'カフェ・クレープ' then 'カフェ・スイーツ'
  when 'カフェ・サロン・ド・テ' then 'カフェ・スイーツ'
  when 'カフェ・スムージー' then 'カフェ・スイーツ'
  when 'カフェ・ロースタリー' then 'カフェ・スイーツ'
  when 'カフェラウンジ' then 'カフェ・スイーツ'
  when 'コーヒースタンド・カフェ' then 'カフェ・スイーツ'
  when 'フルーツパーラー・カフェ' then 'カフェ・スイーツ'
  when '中国茶・カフェ' then 'カフェ・スイーツ'
  when '日本茶カフェ' then 'カフェ・スイーツ'
  when '日本茶・和カフェ' then 'カフェ・スイーツ'
  when 'レストラン' then 'レストラン・食事'
  when 'ラーメン' then 'レストラン・食事'
  when '海鮮料理' then 'レストラン・食事'
  when 'とんかつ' then 'レストラン・食事'
  when '焼肉' then 'レストラン・食事'
  when '居酒屋' then '居酒屋・バー'
  when 'カフェ・バー' then '居酒屋・バー'
  when 'ミュージックカフェ・バー' then '居酒屋・バー'
  when 'アートカフェ・バー' then '居酒屋・バー'
  when 'ショッピング・お土産' then 'ショッピング'
  when '観光' then '観光・体験'
  when '遊ぶ' then '観光・体験'
  when '宿泊' then '宿泊'
  when 'ドッグカフェ' then 'ペット'
  when 'ドッグカフェ・アニマルカフェ' then 'ペット'
  when '犬OKカフェ' then 'ペット'
  when 'ドッグラン' then 'ペット'
  when 'ドッグリゾート' then 'ペット'
  when 'ペット宿泊' then 'ペット'
  when '美容室' then '美容・暮らし'
  when '暮らし・サービス' then '美容・暮らし'
  when 'コミュニティカフェ' then 'コミュニティ'
  when 'コミュニティスペース' then 'コミュニティ'
  else 'その他'
end
where s.category is not null and s.category <> '公式';

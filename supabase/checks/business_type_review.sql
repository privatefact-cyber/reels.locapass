-- 業態(business_type)の自動割り当て(00177)で、決めきれなかった店の一覧。運営が1件ずつ確認して、
-- 必要なら管理画面(ルート管理者のみ)で業態を直す。
--   pet          … 業種が「ペット」。業態は other にして、属性「ペット同伴可」(pet_ok)を付けてある(00178)。
--                  ペットホテルなら stay、トリミングなら beauty、ドッグランなら leisure、ペット用品店なら retail が候補。
--   unlisted     … 業種が固定10種(lib/shop/locapassCategories.ts)に無い古い値。
--   no_category  … 業種が未設定。
--   fallback     … コミュニティ・その他・公式で、ひとまず other にした店(優先度は低め)。
select
  case
    when s.category = 'ペット' then 'pet'
    when s.category is null then 'no_category'
    when s.category in ('コミュニティ', 'その他', '公式') then 'fallback'
    when s.category not in ('カフェ・スイーツ', 'レストラン・食事', '居酒屋・バー', 'ショッピング', '観光・体験', '宿泊', '美容・暮らし') then 'unlisted'
  end as reason,
  p.slug as portal,
  s.name,
  s.category,
  s.business_type,
  s.status,
  s.id
from public.locapass_shops s
join public.locapass_portals p on p.id = s.portal_id
where s.business_type = 'other' or s.business_type is null
order by 1, 2, 3;

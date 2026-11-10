-- 公開中の飲食店に、店名・キャッチコピー・紹介文から「料理」属性(locapass_shop_attributes.cuisine)を自動で付ける。
-- 既に料理を設定している店(店舗が自分で選んだ店)は上書きしない。detail.auto = true は自動付与の印で、
-- 店舗が管理画面で「決定」を押すと外れる。ルールは控えめ(当たらない店は何も付けない=未設定のまま)。
-- 実行: Supabase の SQL エディタ、または execute_sql。何度流しても安全(on conflict do nothing)。
insert into public.locapass_shop_attributes (shop_id, attribute_key, detail)
select id, 'cuisine', jsonb_build_object('genres', to_jsonb(genres), 'auto', true)
from (
  select id, array_remove(array[
    case when t ~* 'ラーメン|らーめん|拉麺|中華そば|つけ麺|つけめん|油そば|担々麺|家系|麺屋|麺処|麺や|ramen' then 'ramen' end,
    case when t ~* '寿司|鮨|回転ずし|sushi' then 'sushi' end,
    case when t ~* '天ぷら|天麩羅|tempura' then 'tempura' end,
    case when t2 ~* '蕎麦|うどん|udon|そば処|そば屋|手打そば' then 'soba_udon' end,
    case when t ~* 'とんかつ|トンカツ|豚カツ|かつ丼|tonkatsu' then 'tonkatsu' end,
    case when t ~* 'うなぎ|鰻|ウナギ' then 'unagi' end,
    case when t ~* '焼肉|焼き肉|ステーキ|ホルモン|steak|yakiniku' then 'yakiniku' end,
    case when t ~* '焼き鳥|焼鳥|やきとり|串焼|串カツ|串揚' then 'yakitori' end,
    case when t ~* '和食|定食|割烹|日本料理|おでん' then 'washoku' end,
    case when t ~* '懐石|会席' then 'kaiseki' end,
    case when t ~* '海鮮|刺身|牡蠣|カキ小屋|鮮魚|魚料理' then 'seafood' end,
    case when t ~* '鍋|しゃぶしゃぶ|すき焼' then 'nabe' end,
    case when t ~* 'お好み焼|もんじゃ|たこ焼|たこやき' then 'okonomiyaki' end,
    case when t ~* '丼|どんぶり' then 'donburi' end,
    case when t ~* 'カレー|curry|スパイスカリー' then 'curry' end,
    case when t2 ~* '中華|中国料理|餃子|点心|小籠包|火鍋|四川|麻婆|チャーハン' then 'chinese' end,
    case when t ~* '韓国|サムギョプサル|ダッカルビ|チゲ|korean' then 'korean' end,
    case when t ~* 'イタリアン|パスタ|ピッツァ|ピザ|トラットリア|pizza|pasta|リストランテ' then 'italian' end,
    case when t ~* 'フレンチ|ビストロ|bistro|フランス料理|french' then 'french' end,
    case when t ~* '洋食|オムライス|ハンバーグ|ナポリタン' then 'western' end,
    case when t ~* 'バーガー|burger' then 'burger' end,
    case when t ~* 'タイ料理|ベトナム|インド料理|ネパール|エスニック|アジア料理|台湾|ガパオ|ケバブ|メキシコ|タコス' then 'asian' end,
    case when t ~* 'カフェ|cafe|café|珈琲|コーヒー|喫茶|スイーツ|ケーキ|パティスリー|パフェ|かき氷|紅茶|日本茶|クレープ|ドーナツ|プリン' then 'cafe_sweets' end,
    case when t ~* 'ベーカリー|パン屋|ブーランジェ|boulangerie|bakery|パン工房' then 'bakery' end,
    case when t ~* '酒場|居酒屋|\ybar\y|ワイン|日本酒|izakaya|スナック' or t ~ '(^|[^ハンカナ])バー($|[^ガグ])' then 'bar' end
  ], null) as genres
  from (
    select id, t, replace(t, '中華そば', 'ラーメン') as t2
    from (
      select id, (coalesce(name,'')||' '||coalesce(tagline,'')||' '||left(coalesce(description,''),250)) as t
      from public.locapass_shops
      where status = 'active' and business_type = 'food'
    ) base
    -- 美容系の店が飲食に紛れているときは付けない。
    where not (t ~* 'ヘアサロン|ネイル|美容室|エステ|ヘッドスパ|まつげ|アイラッシュ')
  ) x
) y
where cardinality(genres) > 0
on conflict (shop_id, attribute_key) do nothing;

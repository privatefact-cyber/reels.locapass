-- 店舗が増えたとき・紹介文が入ったときに、「料理」「ペット同伴可」の属性を自動で付ける。
-- ルールは scripts/backfill-cuisine.sql と同じ(店名+キャッチコピー+紹介文の先頭250字から判定)。
--  - 既に行がある属性は、絶対に上書きしない(店舗が自分で選んだ内容を守る)。
--  - 付けた行には detail.auto = true の印を入れる(料理)。店舗が管理画面で「決定」すれば外れる。
--  - 店舗が属性を外した後に、勝手に付け直さないよう、次のときだけ動く:
--      新規登録 / 紹介文が空から入ったとき / 公開(active)になったとき / 業種(business_type)が変わったとき。
--  - ペットは、同伴できると明記されているときだけ(「不可」「禁止」「NG」を含む文は付けない)。ドッグランがあるだけでは付けない。
-- 注意: 属性テーブルには外部キーが既にある。ここでは新しい外部キーを足さない。

create or replace function public.locapass_auto_cuisine_genres(p_name text, p_tagline text, p_description text)
returns text[]
language sql
immutable
as $$
  select array_remove(array[
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
  ], null)
  from (
    select t, replace(t, '中華そば', 'ラーメン') as t2
    from (select (coalesce(p_name,'')||' '||coalesce(p_tagline,'')||' '||left(coalesce(p_description,''),250)) as t) b
    -- 美容系の店が飲食に紛れているときは付けない。
    where not (t ~* 'ヘアサロン|ネイル|美容室|エステ|ヘッドスパ|まつげ|アイラッシュ')
  ) x
$$;

create or replace function public.locapass_auto_attributes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  genres text[];
  txt text;
  has_terrace boolean;
begin
  if new.status is distinct from 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    -- 付け直しを避けるため、きっかけがあったときだけ動く。
    if not (
      coalesce(old.description, '') = ''
      or old.status is distinct from 'active'
      or old.business_type is distinct from new.business_type
    ) then
      return new;
    end if;
  end if;

  -- 料理(飲食店のみ)
  if new.business_type = 'food' then
    genres := public.locapass_auto_cuisine_genres(new.name, new.tagline, new.description);
    if genres is not null and cardinality(genres) > 0 then
      insert into public.locapass_shop_attributes (shop_id, attribute_key, detail)
      values (new.id, 'cuisine', jsonb_build_object('genres', to_jsonb(genres), 'auto', true))
      on conflict (shop_id, attribute_key) do nothing;
    end if;
  end if;

  -- ペット同伴可(同伴できると明記されているときだけ。付いていなければ)
  txt := coalesce(new.name, '') || ' ' || coalesce(new.tagline, '') || ' ' || left(coalesce(new.description, ''), 500);
  if txt ~* '(ペット|ワンちゃん|愛犬|わんこ|ワンコ|犬|愛猫)(と|も)?(の)?(同伴|一緒|ご一緒|同行|連れ)|同伴(可|OK|ＯＫ|できます|可能)|ペット(可|OK|ＯＫ|歓迎|同伴|フレンドリー)|ワンちゃんと泊まれ|ペットと泊まれ|愛犬と泊まれ'
     and txt !~* '不可|禁止|NG|ＮＧ|お断り|できません|ご遠慮'
     and not exists (select 1 from public.locapass_shop_attributes a where a.shop_id = new.id and a.attribute_key in ('pet_ok', 'pet_only')) then
    has_terrace := txt ~ 'テラス|ウッドデッキ';
    insert into public.locapass_shop_attributes (shop_id, attribute_key, detail)
    values (new.id, 'pet_ok', case when has_terrace then '{"place":["terrace"]}'::jsonb else '{}'::jsonb end)
    on conflict (shop_id, attribute_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists locapass_shops_auto_attributes on public.locapass_shops;
create trigger locapass_shops_auto_attributes
  after insert or update of name, tagline, description, status, business_type on public.locapass_shops
  for each row execute function public.locapass_auto_attributes();

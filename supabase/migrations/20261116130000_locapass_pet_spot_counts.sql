-- ロカわん「おでかけ」の登録件数(地図に出せるペット施設・一緒に行ける店の総数)。
--   verified: LOCAPASSに掲載中(公開中・座標あり)で、ペット施設ポータル(lizand)の店、または🐾属性(pet_ok / pet_only)のある店
--   places  : 取り込んだ施設(ドッグラン・動物病院など。locapass_pet_places)
-- security invoker なので、数えるのは「その人に見えるデータ」だけ(公開中のお店のRLSがそのまま効く)。
-- 画面に出す数字は、アプリ側で短時間キャッシュして、お店や施設が増えれば自動で数え直される。
create or replace function public.locapass_pet_spot_counts()
returns table (verified bigint, places bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (
      select count(*)
      from public.locapass_shops s
      where s.status = 'active'
        and s.lat is not null
        and s.lng is not null
        and (
          s.portal_id in (select p.id from public.locapass_portals p where p.slug = 'lizand')
          or exists (
            select 1 from public.locapass_shop_attributes a
            where a.shop_id = s.id and a.attribute_key in ('pet_ok', 'pet_only')
          )
        )
    ),
    (select count(*) from public.locapass_pet_places)
$$;

grant execute on function public.locapass_pet_spot_counts() to anon, authenticated;

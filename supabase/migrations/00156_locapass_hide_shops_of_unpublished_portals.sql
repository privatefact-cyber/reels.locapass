-- 公開前(status が active 以外)のポータルの店舗は、一般の人(未ログイン・ログイン中の一般会員)には見せない。
-- 見られるのは、これまでどおり、その店の管理者・スタッフと、ポータル管理者・ルート管理者(locapass_is_shop_staff に含まれる)だけ。
-- 店舗を読む他のテーブル(リール・イベント・在庫など)の公開ルールも、店舗の見え方に従って、あわせて隠れる。
-- 地図・トップ・検索・sitemapなど、一般向けの画面が、公開前のポータルの店を出さないための、土台。

create or replace function public.locapass_portal_is_public(p_portal_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.locapass_portals p where p.id = p_portal_id and p.status = 'active')
$$;
grant execute on function public.locapass_portal_is_public(bigint) to anon, authenticated;

alter policy "shops public read active" on public.locapass_shops
  using (
    (status = 'active' and public.locapass_portal_is_public(portal_id))
    or public.locapass_is_shop_staff(id)
  );

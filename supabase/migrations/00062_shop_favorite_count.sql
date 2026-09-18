-- 店舗管理画面に「現在お気に入りされている数」を出すためのRPC。
-- user_shop_favoritesのRLSは「本人が登録した行だけ見える」設計(user_id = auth.uid())のため、
-- 店舗スタッフが「自店舗が何人にお気に入り登録されているか」を数えることができない。
-- count_cast_followers(00044)と同じ思想: 件数だけを返し、誰がお気に入りしているかは見せない。
create or replace function public.count_shop_favorites(p_shop_id uuid)
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select count(*) from public.user_shop_favorites where shop_id = p_shop_id;
$$;

revoke all on function public.count_shop_favorites(uuid) from public;
revoke execute on function public.count_shop_favorites(uuid) from anon;
grant execute on function public.count_shop_favorites(uuid) to authenticated;

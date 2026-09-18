-- キャスト自身のマイページにフォロワー数を出すためのRPC。
-- user_cast_followsのRLSは「自分がフォローした行だけ見える」設計(user_id = auth.uid())
-- のため、キャスト本人が「自分が何人にフォローされているか」を数えることができない。
-- 件数(整数)だけを返す関数を用意し、誰がフォローしているかは一切見せない。
create or replace function public.count_cast_followers(p_cast_id uuid)
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select count(*) from public.user_cast_follows where cast_id = p_cast_id;
$$;

revoke all on function public.count_cast_followers(uuid) from public;
revoke execute on function public.count_cast_followers(uuid) from anon;
grant execute on function public.count_cast_followers(uuid) to authenticated;

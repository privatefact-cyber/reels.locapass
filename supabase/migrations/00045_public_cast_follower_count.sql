-- キャスト公開プロフィールページ(/cast/[castId])は未ログインの一般客も見るため、
-- count_cast_followers(authenticatedのみに許可していた)をanonにも開放する。
-- 件数(整数)だけを返す関数で、誰がフォローしているかは分からないため公開して問題ない。
grant execute on function public.count_cast_followers(uuid) to anon;

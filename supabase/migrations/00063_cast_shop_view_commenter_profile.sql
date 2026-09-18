-- リールにコメントした客がどんなユーザーか、キャスト・店舗スタッフには最低限
-- (ニックネーム・アイコンのみ)わかるようにする。完全匿名だと返信・ブロック判断が
-- しづらい(「怖い」)という運用上の要望。フォロー中キャスト/お気に入り店舗などの
-- 他のプライベート情報は引き続き非公開(user_profilesにはニックネームとアイコンしか
-- 持たせていないため、これ以上は元々見えようがない)。
--
-- 対象は「自分のリールにコメントしてきた客」限定(無条件に全ユーザーのプロフィールが
-- 見えるわけではない)。

create policy "cast view own reel commenter profile"
  on public.user_profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.reel_comments c
      join public.reels r on r.id = c.reel_id
      where c.user_id = user_profiles.id
        and c.author_type = 'customer'
        and r.cast_id = public.current_cast_id()
    )
  );

create policy "shop staff view own shop commenter profile"
  on public.user_profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.reel_comments c
      join public.reels r on r.id = c.reel_id
      where c.user_id = user_profiles.id
        and c.author_type = 'customer'
        and r.shop_id in (select public.current_shop_ids())
    )
  );

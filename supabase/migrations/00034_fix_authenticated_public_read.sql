-- ログイン中(authenticated)のユーザーが、他店舗の公開ページ
-- (/cast/[castId] 等)を閲覧すると404になる不具合の修正。
--
-- cast_members / media / schedules / cast_diary_entries は
-- 「anon read ... of active shops」がanonロール限定になっており、
-- authenticatedロール向けには「自店舗の分のみ」の全権ポリシーしか
-- 存在しなかった。shops・reelsは既にanon,authenticated両方に
-- active shop分の閲覧を許可しているため、それと同じ形に揃える。
--
-- RLSポリシーはOR結合されるため、既存の「自店舗のみ全権」ポリシーは
-- そのまま残り、今回追加する分は閲覧範囲を広げるだけで安全性は
-- 損なわれない(公開ページとして誰でも見える情報を、ログイン中の
-- ユーザーにも同じく見せるだけ)。

alter policy "anon read cast of active shops"
  on public.cast_members
  to anon, authenticated;

alter policy "anon read media of active shops"
  on public.media
  to anon, authenticated;

alter policy "anon read schedules of active shops"
  on public.schedules
  to anon, authenticated;

alter policy "anon read diary of active shops"
  on public.cast_diary_entries
  to anon, authenticated;

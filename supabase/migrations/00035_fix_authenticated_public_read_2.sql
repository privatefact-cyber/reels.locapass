-- 00034と同じ不具合パターンの追加是正。
-- shop_events(イベント告知)・shop_price_items(料金表)も
-- 「anon read ... of active shops」がanonロール限定になっており、
-- ログイン中のユーザーには見えていなかった。

alter policy "anon read events of active shops"
  on public.shop_events
  to anon, authenticated;

alter policy "anon read price items of active shops"
  on public.shop_price_items
  to anon, authenticated;

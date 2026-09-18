-- 店舗情報編集機能の追加に伴い、自店舗の shops 行を更新できるポリシーを追加する。
-- (初期設計時は shops 自体の編集は仕様に含まれていなかったため未実装だった)
create policy "authenticated update own shop"
  on public.shops for update
  to authenticated
  using (id in (select public.current_shop_ids()))
  with check (id in (select public.current_shop_ids()));

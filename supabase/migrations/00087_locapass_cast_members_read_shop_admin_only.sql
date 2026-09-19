-- キャストの本名・住所・電話などは、LUXELA本家と同じく店舗アカウント(shop_admin)以上だけが読める。
-- 現場スタッフ(staff)個人には見せない(00084では staff も読めてしまっていた)。
drop policy "cast members read by shop staff" on public.locapass_cast_members;
create policy "cast members read by shop admin" on public.locapass_cast_members for select
  using (locapass_is_shop_admin(shop_id));

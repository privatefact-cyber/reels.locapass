-- コメントした会員のニックネーム・アイコンを、そのリールのキャスト本人と店舗側だけが見られるようにする
-- (本家 user_profiles と同じ)。これまでこの2ポリシーは LUXELA の reel_comments / reels を参照していた。
drop policy "cast view own reel commenter profile" on public.locapass_members;
drop policy "shop staff view own shop commenter profile" on public.locapass_members;
create policy "cast view own reel commenter profile" on public.locapass_members for select to authenticated
  using (exists (select 1 from public.locapass_reel_comments c join public.locapass_reels r on r.id = c.reel_id
                 where c.user_id = locapass_members.id and c.author_type = 'customer'
                   and r.cast_id = locapass_current_cast_id()));
create policy "shop staff view own shop commenter profile" on public.locapass_members for select to authenticated
  using (exists (select 1 from public.locapass_reel_comments c join public.locapass_reels r on r.id = c.reel_id
                 where c.user_id = locapass_members.id and c.author_type = 'customer'
                   and locapass_is_shop_staff(r.shop_id)));

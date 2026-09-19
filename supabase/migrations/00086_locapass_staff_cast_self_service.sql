-- staff / cast 本人用画面(/dashboard/staff, /dashboard/cast)のための権限。
-- LUXELA本家の update_own_staff_profile / update_own_cast_profile と同じく、本人の行だけを更新する関数。
create or replace function public.locapass_update_own_staff_profile(p_name text, p_bio text, p_avatar_url text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.locapass_shop_staff_members
  set
    name = coalesce(nullif(trim(p_name), ''), name),
    bio = p_bio,
    avatar_url = coalesce(p_avatar_url, avatar_url)
  where id = public.locapass_current_staff_member_id();
end;
$$;

create or replace function public.locapass_update_own_cast_profile(p_name text, p_pr_text text, p_avatar_url text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.locapass_cast_members
  set
    name = coalesce(nullif(trim(p_name), ''), name),
    pr_text = p_pr_text,
    avatar_url = coalesce(p_avatar_url, avatar_url)
  where id = public.locapass_current_cast_id();
end;
$$;

revoke all on function public.locapass_update_own_staff_profile(text, text, text) from public, anon;
revoke all on function public.locapass_update_own_cast_profile(text, text, text) from public, anon;
grant execute on function public.locapass_update_own_staff_profile(text, text, text) to authenticated;
grant execute on function public.locapass_update_own_cast_profile(text, text, text) to authenticated;

-- cast はスタッフではないため、既存の「店舗スタッフ以上」のリール権限には入らない。
-- 仕様「cast: 自身のリール投稿」に合わせ、自店舗への投稿と自分の投稿の閲覧・削除だけを許可する
-- (locapass_reels.created_by はトリガーで auth.uid() に固定される)。
create or replace function public.locapass_current_cast_shop_id()
returns uuid language sql stable security definer set search_path = public as $$
  select shop_id from locapass_cast_members where user_id = auth.uid() limit 1;
$$;

create policy "reels cast insert own shop" on public.locapass_reels for insert
  to authenticated
  with check (shop_id is not null and shop_id = locapass_current_cast_shop_id());
create policy "reels cast read own" on public.locapass_reels for select
  to authenticated
  using (created_by = auth.uid() and shop_id = locapass_current_cast_shop_id());
create policy "reels cast delete own" on public.locapass_reels for delete
  to authenticated
  using (created_by = auth.uid() and shop_id = locapass_current_cast_shop_id());

create policy "locapass reels media upload by cast" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'locapass-reels' and ((storage.foldername(name))[1])::uuid = locapass_current_cast_shop_id());
create policy "locapass reels media delete by cast" on storage.objects for delete
  to authenticated
  using (bucket_id = 'locapass-reels' and ((storage.foldername(name))[1])::uuid = locapass_current_cast_shop_id());

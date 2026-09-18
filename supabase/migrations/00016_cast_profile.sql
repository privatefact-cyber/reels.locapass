-- キャストが自分のマイページ(Instagramプロフィール風UI)からアイコン・名前・自己紹介を
-- 編集できるようにする。
-- cast_membersへのUPDATEは現状「shop_id in current_shop_ids()」(店舗スタッフ)のみ許可されており、
-- キャスト本人(current_cast_id())には無いため、本人用の専用RPCを用意して
-- 更新できる列を限定する(shop_idの書き換え等を防ぐため、RLSの緩和ではなくSECURITY DEFINER関数にする)。

alter table public.cast_members
  add column avatar_url text;

create or replace function public.update_own_cast_profile(
  p_name text,
  p_pr_text text,
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cast_members
  set
    name = coalesce(nullif(trim(p_name), ''), name),
    pr_text = p_pr_text,
    avatar_url = coalesce(p_avatar_url, avatar_url)
  where id = public.current_cast_id();
end;
$$;

revoke all on function public.update_own_cast_profile(text, text, text) from public;
grant execute on function public.update_own_cast_profile(text, text, text) to authenticated;

-- =========================================================
-- avatars バケット(公開読み取り、本人のフォルダのみ書き込み。reelsバケットと同じ思想)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "public read avatar media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

create policy "cast upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_cast_id()::text
  );

create policy "cast update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_cast_id()::text
  );

create policy "cast delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.current_cast_id()::text
  );

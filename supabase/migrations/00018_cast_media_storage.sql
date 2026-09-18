-- 店舗管理画面(/dashboard/cast/[castId])のキャスト写真登録を、これまでの「画像URLを手入力」から
-- 実ファイルのアップロードに切り替えるためのストレージバケット。
-- reels/avatars バケットは「本人(current_cast_id())が自分のフォルダに書き込む」設計だが、
-- こちらは「店舗スタッフ(current_shop_ids())が、自店舗に所属するキャストのフォルダに書き込む」設計にする。

insert into storage.buckets (id, name, public)
values ('cast-media', 'cast-media', true)
on conflict (id) do nothing;

create policy "public read cast media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'cast-media');

create policy "shop upload own cast media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cast-media'
    and exists (
      select 1 from public.cast_members c
      where c.id::text = (storage.foldername(name))[1]
        and c.shop_id in (select public.current_shop_ids())
    )
  );

create policy "shop delete own cast media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'cast-media'
    and exists (
      select 1 from public.cast_members c
      where c.id::text = (storage.foldername(name))[1]
        and c.shop_id in (select public.current_shop_ids())
    )
  );

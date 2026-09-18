-- 身分証(免許証・マイナンバーカード)のスキャン画像を保存するための非公開ストレージバケット。
-- cast-media(public: true)と異なり、こちらは本人確認書類のため非公開にし、
-- 自店舗のスタッフのみ読み書き・削除できるようにする(署名付きURLで一時的に閲覧)。

insert into storage.buckets (id, name, public)
values ('id-documents', 'id-documents', false)
on conflict (id) do nothing;

create policy "shop read own cast id document"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'id-documents'
    and exists (
      select 1 from public.cast_members c
      where c.id::text = (storage.foldername(name))[1]
        and c.shop_id in (select public.current_shop_ids())
    )
  );

create policy "shop upload own cast id document"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'id-documents'
    and exists (
      select 1 from public.cast_members c
      where c.id::text = (storage.foldername(name))[1]
        and c.shop_id in (select public.current_shop_ids())
    )
  );

create policy "shop update own cast id document"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'id-documents'
    and exists (
      select 1 from public.cast_members c
      where c.id::text = (storage.foldername(name))[1]
        and c.shop_id in (select public.current_shop_ids())
    )
  );

create policy "shop delete own cast id document"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'id-documents'
    and exists (
      select 1 from public.cast_members c
      where c.id::text = (storage.foldername(name))[1]
        and c.shop_id in (select public.current_shop_ids())
    )
  );

alter table public.cast_members
  add column if not exists id_document_path text;

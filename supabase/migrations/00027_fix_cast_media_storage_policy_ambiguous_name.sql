-- 00018のポリシーは storage.foldername(name) の name が、相関サブクエリ内の
-- cast_members.name (キャストの表示名, 例:「みお」) に解決されてしまい、
-- アップロードされたファイルパス(storage.objects.name)を正しく見ていなかった。
-- 常に一致せずRLS違反でアップロードが失敗するバグを修正する。

drop policy if exists "shop upload own cast media" on storage.objects;
drop policy if exists "shop delete own cast media" on storage.objects;

create policy "shop upload own cast media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cast-media'
    and exists (
      select 1 from public.cast_members c
      where c.id::text = (storage.foldername(objects.name))[1]
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
      where c.id::text = (storage.foldername(objects.name))[1]
        and c.shop_id in (select public.current_shop_ids())
    )
  );

-- 一般ユーザー(客)がマイページでアイコンを変更できるように、既存の avatars バケットに
-- 「本人(auth.uid())が自分のフォルダに書き込む」ポリシーを追加する。
-- cast/staffの既存ポリシー(フォルダ名 = current_cast_id() / current_staff_member_id())とは
-- OR結合されるだけなので、既存の権限は変わらない。

create policy "user upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "user update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "user delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

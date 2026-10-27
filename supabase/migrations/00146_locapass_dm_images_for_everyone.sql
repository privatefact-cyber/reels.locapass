-- DMの画像を、スタッフ側だけでなくユーザーも含め参加者全員が送れるようにする。
-- 店舗が作った割引チケットなどの画像を送る用途のため、定型スタンプは使わない(画面から廃止)。
-- 画像は引き続き、相互フォロー中のスレッドの参加者だけが送受信できる。

alter table public.locapass_staff_dm_messages drop constraint locapass_staff_dm_messages_image_by_staff;

drop policy "locapass staff dm user sends own message" on public.locapass_staff_dm_messages;
create policy "locapass staff dm user sends own message"
  on public.locapass_staff_dm_messages for insert to authenticated
  with check (
    sender_type = 'user'
    and (image_path is null or public.locapass_dm_thread_id_of_path(image_path) = thread_id)
    and exists (select 1 from public.locapass_staff_dm_threads t where t.id = thread_id and t.user_id = auth.uid())
    and public.locapass_dm_thread_open(thread_id)
  );

drop policy "locapass dm images uploadable by staff side while open" on storage.objects;
create policy "locapass dm images uploadable by participants while open"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'locapass-dm'
    and public.locapass_dm_thread_id_of_path(name) is not null
    and public.locapass_dm_is_participant(public.locapass_dm_thread_id_of_path(name))
    and public.locapass_dm_thread_open(public.locapass_dm_thread_id_of_path(name))
  );

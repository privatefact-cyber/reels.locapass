-- 店舗からお気に入りユーザーへの一括メッセージ(locapass_send_shop_message)に、画像を添付できるようにする。
-- 用途: 店舗が作った割引チケットなどを画像で送る。
-- ・画像は非公開バケット locapass-shop-messages(<店舗ID>/<ファイル名>)に置く。アップロードできるのはその店舗の管理者だけ。
-- ・読めるのは、その店舗の管理者と、その画像つきの通知を受け取った本人だけ(署名URLで表示)。
-- ・本文は、画像があれば空でもよい。

alter table public.locapass_notifications add column image_path text;

create or replace function public.locapass_shop_id_of_path(p_name text)
returns uuid language sql immutable as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;

-- 通知を受け取った本人が、その通知の画像を読めるか(ストレージのRLSから呼ぶ)。
create or replace function public.locapass_can_read_shop_message_image(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.locapass_is_shop_admin(public.locapass_shop_id_of_path(p_name))
    or exists (select 1 from locapass_notifications n where n.user_id = auth.uid() and n.image_path = p_name)
  );
$$;
revoke all on function public.locapass_can_read_shop_message_image(text) from public, anon;
grant execute on function public.locapass_can_read_shop_message_image(text) to authenticated;
grant execute on function public.locapass_shop_id_of_path(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('locapass-shop-messages', 'locapass-shop-messages', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "locapass shop message images readable by recipients and admins"
  on storage.objects for select to authenticated
  using (bucket_id = 'locapass-shop-messages' and public.locapass_can_read_shop_message_image(name));

create policy "locapass shop message images uploadable by shop admins"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'locapass-shop-messages'
    and public.locapass_shop_id_of_path(name) is not null
    and public.locapass_is_shop_admin(public.locapass_shop_id_of_path(name))
  );

drop function public.locapass_send_shop_message(uuid, text, uuid);
create or replace function public.locapass_send_shop_message(
  p_shop_id uuid, p_body text, p_target_user_id uuid default null, p_image_path text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_name text;
  v_count integer;
  v_body text := trim(coalesce(p_body, ''));
begin
  if not locapass_is_shop_admin(p_shop_id) then raise exception 'forbidden'; end if;
  if v_body = '' and p_image_path is null then raise exception '本文を入力するか、画像を添付してください'; end if;
  if p_image_path is not null and public.locapass_shop_id_of_path(p_image_path) is distinct from p_shop_id then
    raise exception '画像が正しくありません';
  end if;
  select name into v_shop_name from public.locapass_shops where id = p_shop_id;
  if p_target_user_id is not null
     and not exists (select 1 from public.locapass_shop_favorites where shop_id = p_shop_id and member_id = p_target_user_id) then
    raise exception 'お気に入り登録していないユーザーには送信できません';
  end if;
  insert into public.locapass_notifications (user_id, type, title, body, url, shop_id, image_path)
  select f.member_id, 'shop_message', v_shop_name || 'からのメッセージ',
         coalesce(nullif(v_body, ''), '画像が届きました'), '/shops/' || p_shop_id, p_shop_id, p_image_path
  from public.locapass_shop_favorites f
  where f.shop_id = p_shop_id and (p_target_user_id is null or f.member_id = p_target_user_id);
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception '送信先のお気に入りユーザーがいません'; end if;
  return v_count;
end;
$$;
revoke all on function public.locapass_send_shop_message(uuid, text, uuid, text) from public, anon;
grant execute on function public.locapass_send_shop_message(uuid, text, uuid, text) to authenticated;

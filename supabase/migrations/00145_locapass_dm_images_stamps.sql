-- DMに「画像」と「絵文字スタンプ」を送れるようにする。
-- 用途: FACES・お店・スタッフから、フォローしてくれたユーザーへ割引チケットなどの画像を送る。
-- ・画像を送れるのはスタッフ側(スタッフ/FACES/店舗管理者)だけ。ユーザー側はスタンプまで(不適切画像の送付防止)。
-- ・スタンプは両側から送れる。
-- ・画像は非公開バケット locapass-dm に置き、スレッドの参加者だけが読める(署名URLで表示)。
-- ・画像もテキストと同じく、相互フォロー中のスレッドにしか送れない(アップロード自体も止める)。

alter table public.locapass_staff_dm_messages
  add column image_path text,
  add column stamp text;

alter table public.locapass_staff_dm_messages
  add constraint locapass_staff_dm_messages_stamp_len check (stamp is null or char_length(stamp) between 1 and 16),
  add constraint locapass_staff_dm_messages_has_content check (btrim(body) <> '' or image_path is not null or stamp is not null),
  add constraint locapass_staff_dm_messages_image_by_staff check (image_path is null or sender_type = 'staff');

-- ---------------------------------------------------------------------
-- 判定関数(パスの先頭フォルダ = スレッドID)
-- ---------------------------------------------------------------------
create or replace function public.locapass_dm_thread_id_of_path(p_name text)
returns uuid language sql immutable as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;

-- ログイン中ユーザーがそのスレッドの参加者か(ユーザー本人 / スタッフ / FACES / 店舗管理者)。
create or replace function public.locapass_dm_is_participant(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from locapass_staff_dm_threads t
    where t.id = p_thread_id
      and (
        t.user_id = auth.uid()
        or (t.staff_id is not null and public.locapass_current_staff_member_id() = t.staff_id)
        or (t.cast_id is not null and public.locapass_current_cast_id() = t.cast_id)
        or public.locapass_is_shop_admin(t.shop_id)
      )
  );
$$;

-- スタッフ側(ユーザー本人以外)の参加者か。画像のアップロード権限に使う。
create or replace function public.locapass_dm_is_staff_side(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from locapass_staff_dm_threads t
    where t.id = p_thread_id
      and (
        (t.staff_id is not null and public.locapass_current_staff_member_id() = t.staff_id)
        or (t.cast_id is not null and public.locapass_current_cast_id() = t.cast_id)
        or public.locapass_is_shop_admin(t.shop_id)
      )
  );
$$;

revoke all on function public.locapass_dm_is_participant(uuid) from public, anon;
revoke all on function public.locapass_dm_is_staff_side(uuid) from public, anon;
grant execute on function public.locapass_dm_is_participant(uuid) to authenticated;
grant execute on function public.locapass_dm_is_staff_side(uuid) to authenticated;
grant execute on function public.locapass_dm_thread_id_of_path(text) to authenticated;

-- ---------------------------------------------------------------------
-- メッセージ送信ポリシーの更新(画像は自分のスレッドのフォルダ配下のみ)
-- ---------------------------------------------------------------------
drop policy "locapass staff dm user sends own message" on public.locapass_staff_dm_messages;
create policy "locapass staff dm user sends own message"
  on public.locapass_staff_dm_messages for insert to authenticated
  with check (
    sender_type = 'user'
    and image_path is null
    and exists (select 1 from public.locapass_staff_dm_threads t where t.id = thread_id and t.user_id = auth.uid())
    and public.locapass_dm_thread_open(thread_id)
  );

drop policy "locapass staff dm staff sends own message" on public.locapass_staff_dm_messages;
create policy "locapass staff dm staff sends own message"
  on public.locapass_staff_dm_messages for insert to authenticated
  with check (
    sender_type = 'staff'
    and public.locapass_dm_is_staff_side(thread_id)
    and (image_path is null or public.locapass_dm_thread_id_of_path(image_path) = thread_id)
    and public.locapass_dm_thread_open(thread_id)
  );

-- 新着通知の文面(画像・スタンプのみのときも本文が空にならないように)。
create or replace function public.locapass_staff_dm_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.locapass_staff_dm_threads%rowtype;
  v_peer_user_id uuid;
  v_preview text;
begin
  select * into v_thread from public.locapass_staff_dm_threads where id = new.thread_id;

  update public.locapass_staff_dm_threads set last_message_at = new.created_at where id = new.thread_id;

  v_preview := coalesce(
    nullif(btrim(new.body), ''),
    case when new.image_path is not null then '画像が届きました' else new.stamp end
  );

  if new.sender_type = 'user' then
    v_peer_user_id := public.locapass_dm_thread_peer_user(new.thread_id);
    if v_peer_user_id is not null then
      insert into public.locapass_notifications (user_id, type, title, body)
      values (v_peer_user_id, 'staff_dm', 'メッセージが届きました', left(v_preview, 100));
    end if;
  else
    insert into public.locapass_notifications (user_id, type, title, body, url)
    values (v_thread.user_id, 'staff_dm', '返信がありました', left(v_preview, 100), '/mypage/messages/' || v_thread.id);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- ストレージ: 非公開バケット locapass-dm(スレッドID/ファイル名)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('locapass-dm', 'locapass-dm', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "locapass dm images readable by participants"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'locapass-dm'
    and public.locapass_dm_thread_id_of_path(name) is not null
    and public.locapass_dm_is_participant(public.locapass_dm_thread_id_of_path(name))
  );

create policy "locapass dm images uploadable by staff side while open"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'locapass-dm'
    and public.locapass_dm_thread_id_of_path(name) is not null
    and public.locapass_dm_is_staff_side(public.locapass_dm_thread_id_of_path(name))
    and public.locapass_dm_thread_open(public.locapass_dm_thread_id_of_path(name))
  );

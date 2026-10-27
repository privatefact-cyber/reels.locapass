-- FACES(キャスト)から、自分をフォローしているユーザーへ一括でメッセージ(画像つき)を送れるようにする。
-- 店舗の一括メッセージ(locapass_send_shop_message)と同じく、受け取る側の「お知らせ」(通知)として届く。
-- DM(1対1のスレッド)は相互フォローのときだけなので、フォローを返していない人にも届く一括送信は
-- 返信できない「お知らせ」として扱う。
-- ・送信先: 自分(FACES)をフォローしているユーザー全員(または1人)。ブロックした/された相手と、
--   コメントでブロックした相手には送らない。
-- ・画像は、店舗の一括メッセージと同じ非公開バケット locapass-shop-messages に <キャストID>/<ファイル名> で置く。
--   アップロードできるのは本人(FACES)だけ。読めるのは本人と、その画像つきの通知を受け取った人だけ。

-- 読み取り権限に「そのキャスト本人」を加える。
create or replace function public.locapass_can_read_shop_message_image(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.locapass_is_shop_admin(public.locapass_shop_id_of_path(p_name))
    or public.locapass_shop_id_of_path(p_name) = public.locapass_current_cast_id()
    or exists (select 1 from locapass_notifications n where n.user_id = auth.uid() and n.image_path = p_name)
  );
$$;

create policy "locapass cast message images uploadable by the cast"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'locapass-shop-messages'
    and public.locapass_shop_id_of_path(name) is not null
    and public.locapass_shop_id_of_path(name) = public.locapass_current_cast_id()
  );

create or replace function public.locapass_send_cast_message(
  p_body text, p_image_path text default null, p_target_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast_id uuid := public.locapass_current_cast_id();
  v_cast_user uuid;
  v_cast_name text;
  v_shop_id uuid;
  v_shop_name text;
  v_url text;
  v_count integer;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_cast_id is null then raise exception 'forbidden'; end if;
  if v_body = '' and p_image_path is null then raise exception '本文を入力するか、画像を添付してください'; end if;
  if p_image_path is not null and public.locapass_shop_id_of_path(p_image_path) is distinct from v_cast_id then
    raise exception '画像が正しくありません';
  end if;

  select c.user_id, c.name, c.shop_id, s.name,
         '/' || p.slug || '/cast/' || s.slug || '-' || c.issue_no
    into v_cast_user, v_cast_name, v_shop_id, v_shop_name, v_url
  from locapass_cast_members c
  join locapass_shops s on s.id = c.shop_id
  join locapass_portals p on p.id = s.portal_id
  where c.id = v_cast_id;

  if p_target_user_id is not null
     and not exists (select 1 from locapass_cast_follows where cast_id = v_cast_id and user_id = p_target_user_id) then
    raise exception 'フォローしていないユーザーには送信できません';
  end if;

  insert into locapass_notifications (user_id, type, title, body, url, shop_id, image_path)
  select f.user_id, 'shop_message', v_cast_name || '(' || v_shop_name || ')からのメッセージ',
         coalesce(nullif(v_body, ''), '画像が届きました'), v_url, v_shop_id, p_image_path
  from locapass_cast_follows f
  where f.cast_id = v_cast_id
    and (p_target_user_id is null or f.user_id = p_target_user_id)
    and not public.locapass_is_blocked_between(v_cast_user, f.user_id)
    and not exists (select 1 from locapass_cast_blocked_users b where b.cast_id = v_cast_id and b.blocked_user_id = f.user_id);
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception '送信先のフォロワーがいません'; end if;
  return v_count;
end;
$$;
revoke all on function public.locapass_send_cast_message(text, text, uuid) from public, anon;
grant execute on function public.locapass_send_cast_message(text, text, uuid) to authenticated;

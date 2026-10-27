-- FACESの一括メッセージ(お知らせ)に「返信する」ボタンを付けるため、通知に送信元のFACES(cast_id)を持たせる。
-- 返信は、相互フォローのときだけ開く1対1のDM(従来どおり)。未達なら案内を出す(画面側)。
alter table public.locapass_notifications
  add column cast_id uuid references public.locapass_cast_members (id) on delete set null;

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

  insert into locapass_notifications (user_id, type, title, body, url, shop_id, image_path, cast_id)
  select f.user_id, 'shop_message', v_cast_name || '(' || v_shop_name || ')からのメッセージ',
         coalesce(nullif(v_body, ''), '画像が届きました'), v_url, v_shop_id, p_image_path, v_cast_id
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

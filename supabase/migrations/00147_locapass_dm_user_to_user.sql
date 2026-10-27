-- ユーザー同士(一般会員 ⇔ 一般会員、スタッフ/FACESから会員へ)も、相互フォローのときだけDMできるようにする。
-- ・スレッドに peer_user_id(相手のユーザー)を追加。user_id=最初にスレッドを作った側、peer_user_id=その相手。
--   メッセージの sender_type は従来どおり、user_id側=「user」、相手側=「staff」(名前は歴史的経緯)。
-- ・会員同士のフォローは、写真投稿者フォローと同じ area_photo_follows を使う(フォローの置き場を1つにする)。
-- ・ブロック・相互フォロー判定は既存のものをそのまま使う。

-- ---------------------------------------------------------------------
-- 1. スレッド
-- ---------------------------------------------------------------------
alter table public.locapass_staff_dm_threads alter column shop_id drop not null;
alter table public.locapass_staff_dm_threads
  add column peer_user_id uuid references auth.users (id) on delete cascade;

alter table public.locapass_staff_dm_threads drop constraint locapass_staff_dm_threads_one_peer;
alter table public.locapass_staff_dm_threads
  add constraint locapass_staff_dm_threads_one_peer
    check (((staff_id is not null)::int + (cast_id is not null)::int + (peer_user_id is not null)::int) = 1),
  add constraint locapass_staff_dm_threads_shop_or_peer check (peer_user_id is not null or shop_id is not null),
  add constraint locapass_staff_dm_threads_not_self check (peer_user_id is null or peer_user_id <> user_id);

-- 同じ2人のスレッドは、どちらが先に作っても1本だけ。
create unique index locapass_staff_dm_threads_user_pair_key
  on public.locapass_staff_dm_threads (least(user_id, peer_user_id), greatest(user_id, peer_user_id))
  where peer_user_id is not null;
create index idx_locapass_staff_dm_threads_peer_user on public.locapass_staff_dm_threads (peer_user_id, last_message_at desc)
  where peer_user_id is not null;

drop policy "locapass staff dm thread visible to participants" on public.locapass_staff_dm_threads;
create policy "locapass staff dm thread visible to participants"
  on public.locapass_staff_dm_threads for select to authenticated
  using (
    user_id = auth.uid()
    or peer_user_id = auth.uid()
    or (staff_id is not null and public.locapass_current_staff_member_id() = staff_id)
    or (cast_id is not null and public.locapass_current_cast_id() = cast_id)
    or (shop_id is not null and public.locapass_is_shop_admin(shop_id))
  );

-- ---------------------------------------------------------------------
-- 2. 判定関数にユーザー同士を足す
-- ---------------------------------------------------------------------
create or replace function public.locapass_is_following(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from locapass_user_follows where follower_id = p_a and followee_id = p_b)
      or exists (select 1 from area_photo_follows where follower_member_id = p_a and followee_member_id = p_b)
      or exists (
        select 1 from locapass_cast_follows f
        join locapass_cast_members c on c.id = f.cast_id
        where f.user_id = p_a and c.user_id = p_b
      );
$$;

create or replace function public.locapass_dm_thread_peer_user(p_thread_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(s.user_id, c.user_id, t.peer_user_id)
  from locapass_staff_dm_threads t
  left join locapass_shop_staff_members s on s.id = t.staff_id
  left join locapass_cast_members c on c.id = t.cast_id
  where t.id = p_thread_id;
$$;

create or replace function public.locapass_dm_is_participant(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from locapass_staff_dm_threads t
    where t.id = p_thread_id
      and (
        t.user_id = auth.uid()
        or t.peer_user_id = auth.uid()
        or (t.staff_id is not null and public.locapass_current_staff_member_id() = t.staff_id)
        or (t.cast_id is not null and public.locapass_current_cast_id() = t.cast_id)
        or (t.shop_id is not null and public.locapass_is_shop_admin(t.shop_id))
      )
  );
$$;

-- 「user_id側ではない側」で送れる人(スタッフ/FACES/店舗管理者、またはユーザー同士の相手側)。
create or replace function public.locapass_dm_is_staff_side(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from locapass_staff_dm_threads t
    where t.id = p_thread_id
      and (
        t.peer_user_id = auth.uid()
        or (t.staff_id is not null and public.locapass_current_staff_member_id() = t.staff_id)
        or (t.cast_id is not null and public.locapass_current_cast_id() = t.cast_id)
        or (t.shop_id is not null and public.locapass_is_shop_admin(t.shop_id))
      )
  );
$$;

drop policy "locapass staff dm messages visible to participants" on public.locapass_staff_dm_messages;
create policy "locapass staff dm messages visible to participants"
  on public.locapass_staff_dm_messages for select to authenticated
  using (public.locapass_dm_is_participant(thread_id));

-- 通知: ユーザー同士のときはマイページのメッセージ画面へ飛べるようにする。
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
  v_url text;
begin
  select * into v_thread from public.locapass_staff_dm_threads where id = new.thread_id;

  update public.locapass_staff_dm_threads set last_message_at = new.created_at where id = new.thread_id;

  v_preview := coalesce(
    nullif(btrim(new.body), ''),
    case when new.image_path is not null then '画像が届きました' else new.stamp end
  );
  v_url := '/mypage/messages/' || v_thread.id;

  if new.sender_type = 'user' then
    v_peer_user_id := public.locapass_dm_thread_peer_user(new.thread_id);
    if v_peer_user_id is not null then
      insert into public.locapass_notifications (user_id, type, title, body, url)
      values (v_peer_user_id, 'staff_dm', 'メッセージが届きました', left(v_preview, 100),
              case when v_thread.peer_user_id is not null then v_url end);
    end if;
  else
    insert into public.locapass_notifications (user_id, type, title, body, url)
    values (v_thread.user_id, 'staff_dm',
            case when v_thread.peer_user_id is not null then 'メッセージが届きました' else '返信がありました' end,
            left(v_preview, 100), v_url);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. フォロー/ブロック操作(会員同士の相手指定に対応)
-- ---------------------------------------------------------------------
create or replace function public.locapass_apply_follow(p_target uuid, p_follow boolean, p_cast_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  if p_target is null or p_target = auth.uid() then raise exception 'フォローできません'; end if;

  if p_follow then
    if public.locapass_is_blocked_between(auth.uid(), p_target) then
      raise exception 'フォローできません';
    end if;
    if p_cast_id is not null then
      insert into locapass_cast_follows (user_id, cast_id) values (auth.uid(), p_cast_id) on conflict do nothing;
    elsif exists (select 1 from locapass_shop_staff_members where user_id = p_target)
       or exists (select 1 from locapass_cast_members where user_id = p_target) then
      insert into locapass_user_follows (follower_id, followee_id) values (auth.uid(), p_target) on conflict do nothing;
    else
      -- 会員(一般ユーザー)宛ては、写真投稿者フォローと同じ area_photo_follows に持つ。
      insert into area_photo_follows (follower_member_id, followee_member_id)
      select auth.uid(), p_target
      where not exists (
        select 1 from area_photo_follows where follower_member_id = auth.uid() and followee_member_id = p_target
      );
    end if;
  else
    delete from locapass_user_follows where follower_id = auth.uid() and followee_id = p_target;
    delete from area_photo_follows where follower_member_id = auth.uid() and followee_member_id = p_target;
    delete from locapass_cast_follows f using locapass_cast_members c
      where f.cast_id = c.id and f.user_id = auth.uid() and c.user_id = p_target;
  end if;
end;
$$;
revoke all on function public.locapass_apply_follow(uuid, boolean, uuid) from public, anon, authenticated;

create or replace function public.locapass_apply_block(p_target uuid, p_block boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  if p_target is null or p_target = auth.uid() then raise exception 'ブロックできません'; end if;

  if p_block then
    insert into locapass_user_blocks (blocker_id, blocked_id) values (auth.uid(), p_target) on conflict do nothing;
    delete from locapass_user_follows
      where (follower_id = auth.uid() and followee_id = p_target) or (follower_id = p_target and followee_id = auth.uid());
    delete from area_photo_follows
      where (follower_member_id = auth.uid() and followee_member_id = p_target)
         or (follower_member_id = p_target and followee_member_id = auth.uid());
    delete from locapass_cast_follows f using locapass_cast_members c
      where f.cast_id = c.id
        and ((f.user_id = auth.uid() and c.user_id = p_target) or (f.user_id = p_target and c.user_id = auth.uid()));
  else
    delete from locapass_user_blocks where blocker_id = auth.uid() and blocked_id = p_target;
  end if;
end;
$$;
revoke all on function public.locapass_apply_block(uuid, boolean) from public, anon, authenticated;

-- 相手指定(スタッフ/FACES/ユーザー)の関数を、ユーザー指定つきで作り直す。
drop function public.locapass_dm_follow(uuid, uuid, boolean);
drop function public.locapass_dm_block(uuid, uuid, boolean);
drop function public.locapass_dm_status(uuid, uuid);
drop function public.locapass_dm_peer_user(uuid, uuid);

create or replace function public.locapass_dm_peer_user(p_staff_id uuid, p_cast_id uuid, p_user_id uuid default null)
returns uuid language sql stable security definer set search_path = public as $$
  select case
    when p_staff_id is not null then (select user_id from locapass_shop_staff_members where id = p_staff_id)
    when p_cast_id is not null then (select user_id from locapass_cast_members where id = p_cast_id)
    else p_user_id end;
$$;
revoke all on function public.locapass_dm_peer_user(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.locapass_dm_follow(p_staff_id uuid default null, p_cast_id uuid default null, p_follow boolean default true, p_user_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.locapass_apply_follow(public.locapass_dm_peer_user(p_staff_id, p_cast_id, p_user_id), p_follow, p_cast_id);
end;
$$;

create or replace function public.locapass_dm_block(p_staff_id uuid default null, p_cast_id uuid default null, p_block boolean default true, p_user_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.locapass_apply_block(public.locapass_dm_peer_user(p_staff_id, p_cast_id, p_user_id), p_block);
end;
$$;

create or replace function public.locapass_dm_status(p_staff_id uuid default null, p_cast_id uuid default null, p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_peer uuid := public.locapass_dm_peer_user(p_staff_id, p_cast_id, p_user_id);
  v_me uuid := auth.uid();
  v_blocked_by_peer boolean;
begin
  if v_me is null or v_peer is null or v_peer = v_me then
    return jsonb_build_object('available', false, 'i_follow', false, 'follows_me', false, 'blocked_by_me', false, 'open', false);
  end if;
  v_blocked_by_peer := exists (select 1 from locapass_user_blocks where blocker_id = v_peer and blocked_id = v_me);
  return jsonb_build_object(
    'available', true,
    'i_follow', public.locapass_is_following(v_me, v_peer),
    'follows_me', (not v_blocked_by_peer) and public.locapass_is_following(v_peer, v_me),
    'blocked_by_me', exists (select 1 from locapass_user_blocks where blocker_id = v_me and blocked_id = v_peer),
    'open', public.locapass_dm_open_between(v_me, v_peer)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. スレッド作成(ユーザー宛て)・一覧・スレッド画面用
-- ---------------------------------------------------------------------
-- スタッフ/FACESのページにいる相手(店舗側アカウント)には使えない(従来のスタッフ/FACES宛てのスレッドを使う)。
create or replace function public.locapass_get_or_create_dm_thread_with_user(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_id uuid;
  v_nickname text;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  if p_user_id is null or p_user_id = auth.uid() then raise exception '相手の指定が正しくありません'; end if;
  if exists (select 1 from locapass_shop_staff_members where user_id = p_user_id)
     or exists (select 1 from locapass_cast_members where user_id = p_user_id) then
    raise exception 'スタッフ・FACESへは、そのページからメッセージしてください';
  end if;
  if not public.locapass_dm_open_between(auth.uid(), p_user_id) then
    raise exception '相互フォローのときだけメッセージを送れます';
  end if;

  select id into v_thread_id from locapass_staff_dm_threads
  where peer_user_id is not null
    and least(user_id, peer_user_id) = least(auth.uid(), p_user_id)
    and greatest(user_id, peer_user_id) = greatest(auth.uid(), p_user_id);
  if v_thread_id is not null then return v_thread_id; end if;

  select nickname into v_nickname from locapass_members where id = auth.uid();
  insert into locapass_staff_dm_threads (user_id, peer_user_id, user_nickname)
  values (auth.uid(), p_user_id, coalesce(v_nickname, 'ゲスト'))
  returning id into v_thread_id;
  return v_thread_id;
end;
$$;

create or replace function public.locapass_dm_thread_label(p_thread_id uuid, p_viewer uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when t.staff_id is not null then coalesce(sh.name, 'LOCAPASS') || '(' || coalesce(s.name, 'スタッフ') || ')'
    when t.cast_id is not null then coalesce(sh.name, 'LOCAPASS') || '(' || coalesce(c.name, 'FACES') || ')'
    when t.user_id = p_viewer then coalesce(mp.nickname, 'ユーザー')
    else coalesce(mi.nickname, t.user_nickname, 'ユーザー')
  end
  from locapass_staff_dm_threads t
  left join locapass_shops sh on sh.id = t.shop_id
  left join locapass_shop_staff_members s on s.id = t.staff_id
  left join locapass_cast_members c on c.id = t.cast_id
  left join locapass_members mp on mp.id = t.peer_user_id
  left join locapass_members mi on mi.id = t.user_id
  where t.id = p_thread_id;
$$;
revoke all on function public.locapass_dm_thread_label(uuid, uuid) from public, anon, authenticated;

-- マイページのメッセージ一覧(自分が user_id 側/相手側のスレッド)。
create or replace function public.locapass_my_dm_threads()
returns table (id uuid, last_message_at timestamptz, label text)
language sql stable security definer set search_path = public as $$
  select t.id, t.last_message_at, public.locapass_dm_thread_label(t.id, auth.uid())
  from locapass_staff_dm_threads t
  where auth.uid() is not null and (t.user_id = auth.uid() or t.peer_user_id = auth.uid())
  order by t.last_message_at desc;
$$;

drop function public.locapass_dm_thread_status(uuid);
create or replace function public.locapass_dm_thread_status(p_thread_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_thread locapass_staff_dm_threads%rowtype;
  v_other uuid;
begin
  select * into v_thread from locapass_staff_dm_threads
  where id = p_thread_id and (user_id = auth.uid() or peer_user_id = auth.uid());
  if not found then return null; end if;
  v_other := case when v_thread.user_id = auth.uid() then public.locapass_dm_thread_peer_user(p_thread_id) else v_thread.user_id end;
  return jsonb_build_object(
    'open', public.locapass_dm_open_between(auth.uid(), v_other),
    'blocked_by_me', exists (select 1 from locapass_user_blocks where blocker_id = auth.uid() and blocked_id = v_other),
    'me_sender', case when v_thread.user_id = auth.uid() then 'user' else 'staff' end,
    'label', public.locapass_dm_thread_label(p_thread_id, auth.uid())
  );
end;
$$;

create or replace function public.locapass_dm_thread_block(p_thread_id uuid, p_block boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_thread locapass_staff_dm_threads%rowtype;
  v_other uuid;
begin
  select * into v_thread from locapass_staff_dm_threads
  where id = p_thread_id and (user_id = auth.uid() or peer_user_id = auth.uid());
  if not found then raise exception 'スレッドが見つかりません'; end if;
  v_other := case when v_thread.user_id = auth.uid() then public.locapass_dm_thread_peer_user(p_thread_id) else v_thread.user_id end;
  perform public.locapass_apply_block(v_other, p_block);
end;
$$;

-- フォロワー一覧: 会員同士のフォロー(area_photo_follows)も含める。
create or replace function public.locapass_my_followers()
returns table (user_id uuid, nickname text, avatar_url text, i_follow_back boolean, followed_at timestamptz)
language sql stable security definer set search_path = public as $$
  with f as (
    select follower_id as uid, created_at from locapass_user_follows where followee_id = auth.uid()
    union all
    select follower_member_id, created_at from area_photo_follows where followee_member_id = auth.uid()
    union all
    select cf.user_id, cf.created_at from locapass_cast_follows cf
      join locapass_cast_members c on c.id = cf.cast_id where c.user_id = auth.uid()
  )
  select f.uid, coalesce(m.nickname, 'ゲスト'), m.avatar_url,
         public.locapass_is_following(auth.uid(), f.uid), max(f.created_at)
  from f
  left join locapass_members m on m.id = f.uid
  where auth.uid() is not null and not public.locapass_is_blocked_between(auth.uid(), f.uid)
  group by f.uid, m.nickname, m.avatar_url
  order by max(f.created_at) desc;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'locapass_dm_follow(uuid, uuid, boolean, uuid)',
    'locapass_dm_block(uuid, uuid, boolean, uuid)',
    'locapass_dm_status(uuid, uuid, uuid)',
    'locapass_get_or_create_dm_thread_with_user(uuid)',
    'locapass_my_dm_threads()',
    'locapass_dm_thread_status(uuid)',
    'locapass_dm_thread_block(uuid, boolean)',
    'locapass_my_followers()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

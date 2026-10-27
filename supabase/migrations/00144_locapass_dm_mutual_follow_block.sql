-- DMを「相互フォロー」のときだけ使えるようにする(ユーザー⇔スタッフ / ユーザー⇔FACES)。
-- ・どちらか片方がフォローを外す/ブロックすると、その時点から送信できなくなる(履歴は残り閲覧のみ可)。
-- ・フォロー: ユーザー→FACESは既存の locapass_cast_follows、それ以外(スタッフ・FACES/スタッフ→ユーザー)は
--   新設の locapass_user_follows に持つ。
-- ・ブロック: locapass_user_blocks(ブロックした側 → された側)。ブロックすると双方向のフォローも外れる。

-- ---------------------------------------------------------------------
-- 1. フォロー / ブロックのテーブル
-- ---------------------------------------------------------------------
create table public.locapass_user_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index idx_locapass_user_follows_followee on public.locapass_user_follows (followee_id);
alter table public.locapass_user_follows enable row level security;
create policy "locapass user follows read own" on public.locapass_user_follows for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());
-- 書き込みは下のRPC(ブロック・自己フォロー検証つき)からのみ行う。

create table public.locapass_user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index idx_locapass_user_blocks_blocked on public.locapass_user_blocks (blocked_id);
alter table public.locapass_user_blocks enable row level security;
create policy "locapass user blocks read own" on public.locapass_user_blocks for select to authenticated
  using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. DMスレッドをFACESにも対応させる(staff_id か cast_id のどちらか一方)
-- ---------------------------------------------------------------------
alter table public.locapass_staff_dm_threads alter column staff_id drop not null;
alter table public.locapass_staff_dm_threads
  add column cast_id uuid references public.locapass_cast_members (id) on delete cascade;
alter table public.locapass_staff_dm_threads
  add constraint locapass_staff_dm_threads_one_peer check ((staff_id is null) <> (cast_id is null));
create unique index locapass_staff_dm_threads_cast_user_key
  on public.locapass_staff_dm_threads (cast_id, user_id) where cast_id is not null;
create index idx_locapass_staff_dm_threads_cast on public.locapass_staff_dm_threads (cast_id, last_message_at desc);

-- ---------------------------------------------------------------------
-- 3. 判定関数
-- ---------------------------------------------------------------------
-- a が b をフォローしているか(FACES宛ては既存の cast_follows も含む)。
create or replace function public.locapass_is_following(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from locapass_user_follows where follower_id = p_a and followee_id = p_b)
      or exists (
        select 1 from locapass_cast_follows f
        join locapass_cast_members c on c.id = f.cast_id
        where f.user_id = p_a and c.user_id = p_b
      );
$$;

create or replace function public.locapass_is_blocked_between(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from locapass_user_blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

create or replace function public.locapass_dm_open_between(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_a is not null and p_b is not null and p_a <> p_b
     and public.locapass_is_following(p_a, p_b)
     and public.locapass_is_following(p_b, p_a)
     and not public.locapass_is_blocked_between(p_a, p_b);
$$;

-- スレッドの相手側(スタッフ/FACES)のログインユーザーID。
create or replace function public.locapass_dm_thread_peer_user(p_thread_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(s.user_id, c.user_id)
  from locapass_staff_dm_threads t
  left join locapass_shop_staff_members s on s.id = t.staff_id
  left join locapass_cast_members c on c.id = t.cast_id
  where t.id = p_thread_id;
$$;

create or replace function public.locapass_dm_thread_open(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.locapass_dm_open_between(t.user_id, public.locapass_dm_thread_peer_user(t.id))
  from locapass_staff_dm_threads t where t.id = p_thread_id;
$$;

revoke all on function public.locapass_is_following(uuid, uuid) from public, anon, authenticated;
revoke all on function public.locapass_is_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke all on function public.locapass_dm_open_between(uuid, uuid) from public, anon, authenticated;
revoke all on function public.locapass_dm_thread_peer_user(uuid) from public, anon, authenticated;
-- RLSのポリシー式の中で呼ばれるので authenticated には実行権限が必要(結果は真偽値のみ)。
grant execute on function public.locapass_dm_thread_open(uuid) to authenticated;
revoke execute on function public.locapass_dm_thread_open(uuid) from anon;

-- ---------------------------------------------------------------------
-- 4. RLS: 参加者(スタッフ/FACES)の閲覧と、送信は「相互フォロー中のみ」
-- ---------------------------------------------------------------------
drop policy "locapass staff dm thread visible to participants" on public.locapass_staff_dm_threads;
create policy "locapass staff dm thread visible to participants"
  on public.locapass_staff_dm_threads for select to authenticated
  using (
    user_id = auth.uid()
    or (staff_id is not null and public.locapass_current_staff_member_id() = staff_id)
    or (cast_id is not null and public.locapass_current_cast_id() = cast_id)
    or public.locapass_is_shop_admin(shop_id)
  );

drop policy "locapass staff dm messages visible to participants" on public.locapass_staff_dm_messages;
create policy "locapass staff dm messages visible to participants"
  on public.locapass_staff_dm_messages for select to authenticated
  using (
    exists (
      select 1 from public.locapass_staff_dm_threads t
      where t.id = thread_id
        and (
          t.user_id = auth.uid()
          or (t.staff_id is not null and public.locapass_current_staff_member_id() = t.staff_id)
          or (t.cast_id is not null and public.locapass_current_cast_id() = t.cast_id)
          or public.locapass_is_shop_admin(t.shop_id)
        )
    )
  );

drop policy "locapass staff dm user sends own message" on public.locapass_staff_dm_messages;
create policy "locapass staff dm user sends own message"
  on public.locapass_staff_dm_messages for insert to authenticated
  with check (
    sender_type = 'user'
    and exists (select 1 from public.locapass_staff_dm_threads t where t.id = thread_id and t.user_id = auth.uid())
    and public.locapass_dm_thread_open(thread_id)
  );

drop policy "locapass staff dm staff sends own message" on public.locapass_staff_dm_messages;
create policy "locapass staff dm staff sends own message"
  on public.locapass_staff_dm_messages for insert to authenticated
  with check (
    sender_type = 'staff'
    and exists (
      select 1 from public.locapass_staff_dm_threads t
      where t.id = thread_id
        and (
          (t.staff_id is not null and public.locapass_current_staff_member_id() = t.staff_id)
          or (t.cast_id is not null and public.locapass_current_cast_id() = t.cast_id)
          or public.locapass_is_shop_admin(t.shop_id)
        )
    )
    and public.locapass_dm_thread_open(thread_id)
  );

-- ---------------------------------------------------------------------
-- 5. スレッド作成RPC(相互フォローのときだけ作れる)
-- ---------------------------------------------------------------------
drop function public.locapass_get_or_create_staff_dm_thread(uuid);

create or replace function public.locapass_get_or_create_dm_thread(p_staff_id uuid default null, p_cast_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_peer_user uuid;
  v_thread_id uuid;
  v_nickname text;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if (p_staff_id is null) = (p_cast_id is null) then
    raise exception '相手の指定が正しくありません';
  end if;

  if p_staff_id is not null then
    select shop_id, user_id into v_shop_id, v_peer_user from locapass_shop_staff_members where id = p_staff_id;
  else
    select shop_id, user_id into v_shop_id, v_peer_user from locapass_cast_members where id = p_cast_id;
  end if;
  if v_shop_id is null then
    raise exception '相手が見つかりません';
  end if;

  if not public.locapass_dm_open_between(auth.uid(), v_peer_user) then
    raise exception '相互フォローのときだけメッセージを送れます';
  end if;

  select nickname into v_nickname from locapass_members where id = auth.uid();

  if p_staff_id is not null then
    insert into locapass_staff_dm_threads (shop_id, staff_id, user_id, user_nickname)
    values (v_shop_id, p_staff_id, auth.uid(), coalesce(v_nickname, 'ゲスト'))
    on conflict (staff_id, user_id) do update set user_nickname = excluded.user_nickname
    returning id into v_thread_id;
  else
    insert into locapass_staff_dm_threads (shop_id, cast_id, user_id, user_nickname)
    values (v_shop_id, p_cast_id, auth.uid(), coalesce(v_nickname, 'ゲスト'))
    on conflict (cast_id, user_id) where cast_id is not null do update set user_nickname = excluded.user_nickname
    returning id into v_thread_id;
  end if;

  return v_thread_id;
end;
$$;
revoke all on function public.locapass_get_or_create_dm_thread(uuid, uuid) from public, anon;
grant execute on function public.locapass_get_or_create_dm_thread(uuid, uuid) to authenticated;

-- 新着通知のトリガーをFACES宛てにも対応させる。
create or replace function public.locapass_staff_dm_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.locapass_staff_dm_threads%rowtype;
  v_peer_user_id uuid;
begin
  select * into v_thread from public.locapass_staff_dm_threads where id = new.thread_id;

  update public.locapass_staff_dm_threads set last_message_at = new.created_at where id = new.thread_id;

  if new.sender_type = 'user' then
    v_peer_user_id := public.locapass_dm_thread_peer_user(new.thread_id);
    if v_peer_user_id is not null then
      insert into public.locapass_notifications (user_id, type, title, body)
      values (v_peer_user_id, 'staff_dm', 'メッセージが届きました', left(new.body, 100));
    end if;
  else
    insert into public.locapass_notifications (user_id, type, title, body, url)
    values (v_thread.user_id, 'staff_dm', '返信がありました', left(new.body, 100), '/mypage/messages/' || v_thread.id);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. フォロー / ブロック操作RPC
-- ---------------------------------------------------------------------
create or replace function public.locapass_dm_peer_user(p_staff_id uuid, p_cast_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case when p_staff_id is not null
    then (select user_id from locapass_shop_staff_members where id = p_staff_id)
    else (select user_id from locapass_cast_members where id = p_cast_id) end;
$$;
revoke all on function public.locapass_dm_peer_user(uuid, uuid) from public, anon, authenticated;

-- 内部: フォロー/解除。FACES宛てだけは既存の cast_follows(ハートと共通)に書く。
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
    else
      insert into locapass_user_follows (follower_id, followee_id) values (auth.uid(), p_target) on conflict do nothing;
    end if;
  else
    delete from locapass_user_follows where follower_id = auth.uid() and followee_id = p_target;
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
    -- 双方向のフォローを外す(=DMも閉じる)。
    delete from locapass_user_follows
      where (follower_id = auth.uid() and followee_id = p_target) or (follower_id = p_target and followee_id = auth.uid());
    delete from locapass_cast_follows f using locapass_cast_members c
      where f.cast_id = c.id
        and ((f.user_id = auth.uid() and c.user_id = p_target) or (f.user_id = p_target and c.user_id = auth.uid()));
  else
    delete from locapass_user_blocks where blocker_id = auth.uid() and blocked_id = p_target;
  end if;
end;
$$;
revoke all on function public.locapass_apply_block(uuid, boolean) from public, anon, authenticated;

-- 公開ページのDMボタン用。相手(スタッフ/FACES)を指定してフォロー/解除。
create or replace function public.locapass_dm_follow(p_staff_id uuid default null, p_cast_id uuid default null, p_follow boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.locapass_apply_follow(public.locapass_dm_peer_user(p_staff_id, p_cast_id), p_follow, p_cast_id);
end;
$$;
create or replace function public.locapass_dm_block(p_staff_id uuid default null, p_cast_id uuid default null, p_block boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.locapass_apply_block(public.locapass_dm_peer_user(p_staff_id, p_cast_id), p_block);
end;
$$;
-- フォロワー一覧用。ユーザーIDを直接指定してフォローバック/ブロック。
-- フォローバックは「自分をフォローしている相手」にだけ行える(無関係な相手を勝手にフォローできない)。
create or replace function public.locapass_follow_back(p_user_id uuid, p_follow boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_follow and not public.locapass_is_following(p_user_id, auth.uid()) then
    raise exception 'フォローできません';
  end if;
  perform public.locapass_apply_follow(p_user_id, p_follow, null);
end;
$$;
create or replace function public.locapass_block_user(p_user_id uuid, p_block boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.locapass_apply_block(p_user_id, p_block);
end;
$$;

-- 公開ページのDMボタンの状態。相手にブロックされている場合も「閉じている」としか返さない。
create or replace function public.locapass_dm_status(p_staff_id uuid default null, p_cast_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_peer uuid := public.locapass_dm_peer_user(p_staff_id, p_cast_id);
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

-- マイページのスレッド画面用: 送信できるか / 相手をブロック中か。
create or replace function public.locapass_dm_thread_status(p_thread_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_thread locapass_staff_dm_threads%rowtype;
  v_peer uuid;
begin
  select * into v_thread from locapass_staff_dm_threads where id = p_thread_id and user_id = auth.uid();
  if not found then return null; end if;
  v_peer := public.locapass_dm_thread_peer_user(p_thread_id);
  return jsonb_build_object(
    'open', public.locapass_dm_open_between(v_thread.user_id, v_peer),
    'blocked_by_me', exists (select 1 from locapass_user_blocks where blocker_id = v_thread.user_id and blocked_id = v_peer)
  );
end;
$$;

-- スレッド画面からのブロック/解除(ユーザー側)。
create or replace function public.locapass_dm_thread_block(p_thread_id uuid, p_block boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_peer uuid;
begin
  if not exists (select 1 from locapass_staff_dm_threads where id = p_thread_id and user_id = auth.uid()) then
    raise exception 'スレッドが見つかりません';
  end if;
  v_peer := public.locapass_dm_thread_peer_user(p_thread_id);
  perform public.locapass_apply_block(v_peer, p_block);
end;
$$;

-- スタッフ/FACES本人のフォロワー一覧(自分をフォロー中のユーザー)。ブロック済みの相手は除く。
create or replace function public.locapass_my_followers()
returns table (user_id uuid, nickname text, avatar_url text, i_follow_back boolean, followed_at timestamptz)
language sql stable security definer set search_path = public as $$
  with f as (
    select follower_id as uid, created_at from locapass_user_follows where followee_id = auth.uid()
    union
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

create or replace function public.locapass_my_blocked_users()
returns table (user_id uuid, nickname text)
language sql stable security definer set search_path = public as $$
  select b.blocked_id, coalesce(m.nickname, 'ゲスト')
  from locapass_user_blocks b left join locapass_members m on m.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'locapass_dm_follow(uuid, uuid, boolean)',
    'locapass_dm_block(uuid, uuid, boolean)',
    'locapass_follow_back(uuid, boolean)',
    'locapass_block_user(uuid, boolean)',
    'locapass_dm_status(uuid, uuid)',
    'locapass_dm_thread_status(uuid)',
    'locapass_dm_thread_block(uuid, boolean)',
    'locapass_my_followers()',
    'locapass_my_blocked_users()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

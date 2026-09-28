-- スタッフ公開ページの「DM」を、ログイン不要の匿名お問い合わせ(locapass_shop_inquiries)から、
-- 登録ユーザー本人とスタッフ本人が直接やり取りする1対1スレッドに切り替える。
-- (LUXELA本家のstaff_dm_threads/staff_dm_messagesと同じ設計)

alter table public.locapass_notifications drop constraint locapass_notifications_type_check;
alter table public.locapass_notifications
  add constraint locapass_notifications_type_check
  check (type in ('new_cast', 'new_event', 'new_shop_reel', 'new_cast_reel', 'shop_message', 'admin_message', 'staff_dm'));

create table public.locapass_staff_dm_threads (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  staff_id uuid not null references public.locapass_shop_staff_members (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  user_nickname text not null default 'ゲスト',
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (staff_id, user_id)
);

create index idx_locapass_staff_dm_threads_staff on public.locapass_staff_dm_threads (staff_id, last_message_at desc);
create index idx_locapass_staff_dm_threads_user on public.locapass_staff_dm_threads (user_id, last_message_at desc);

create table public.locapass_staff_dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.locapass_staff_dm_threads (id) on delete cascade,
  sender_type text not null check (sender_type in ('user', 'staff')),
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_locapass_staff_dm_messages_thread on public.locapass_staff_dm_messages (thread_id, created_at);

alter table public.locapass_staff_dm_threads enable row level security;
alter table public.locapass_staff_dm_messages enable row level security;

create policy "locapass staff dm thread visible to participants"
  on public.locapass_staff_dm_threads for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.locapass_current_staff_member_id() = staff_id
    or public.locapass_is_shop_admin(shop_id)
  );

create policy "locapass staff dm messages visible to participants"
  on public.locapass_staff_dm_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.locapass_staff_dm_threads t
      where t.id = thread_id
        and (
          t.user_id = auth.uid()
          or public.locapass_current_staff_member_id() = t.staff_id
          or public.locapass_is_shop_admin(t.shop_id)
        )
    )
  );

create policy "locapass staff dm user sends own message"
  on public.locapass_staff_dm_messages for insert
  to authenticated
  with check (
    sender_type = 'user'
    and exists (select 1 from public.locapass_staff_dm_threads t where t.id = thread_id and t.user_id = auth.uid())
  );

create policy "locapass staff dm staff sends own message"
  on public.locapass_staff_dm_messages for insert
  to authenticated
  with check (
    sender_type = 'staff'
    and exists (
      select 1 from public.locapass_staff_dm_threads t
      where t.id = thread_id
        and (public.locapass_current_staff_member_id() = t.staff_id or public.locapass_is_shop_admin(t.shop_id))
    )
  );

create or replace function public.locapass_get_or_create_staff_dm_thread(p_staff_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_thread_id uuid;
  v_nickname text;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  select shop_id into v_shop_id from public.locapass_shop_staff_members where id = p_staff_id;
  if v_shop_id is null then
    raise exception 'スタッフが見つかりません';
  end if;

  select nickname into v_nickname from public.locapass_members where id = auth.uid();

  insert into public.locapass_staff_dm_threads (shop_id, staff_id, user_id, user_nickname)
  values (v_shop_id, p_staff_id, auth.uid(), coalesce(v_nickname, 'ゲスト'))
  on conflict (staff_id, user_id) do update set user_nickname = excluded.user_nickname
  returning id into v_thread_id;

  return v_thread_id;
end;
$$;

revoke all on function public.locapass_get_or_create_staff_dm_thread(uuid) from public;
revoke execute on function public.locapass_get_or_create_staff_dm_thread(uuid) from anon;
grant execute on function public.locapass_get_or_create_staff_dm_thread(uuid) to authenticated;

create or replace function public.locapass_staff_dm_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.locapass_staff_dm_threads%rowtype;
  v_staff_user_id uuid;
begin
  select * into v_thread from public.locapass_staff_dm_threads where id = new.thread_id;

  update public.locapass_staff_dm_threads set last_message_at = new.created_at where id = new.thread_id;

  if new.sender_type = 'user' then
    select user_id into v_staff_user_id from public.locapass_shop_staff_members where id = v_thread.staff_id;
    if v_staff_user_id is not null then
      insert into public.locapass_notifications (user_id, type, title, body)
      values (v_staff_user_id, 'staff_dm', 'メッセージが届きました', left(new.body, 100));
    end if;
  else
    insert into public.locapass_notifications (user_id, type, title, body, url)
    values (v_thread.user_id, 'staff_dm', 'スタッフから返信がありました', left(new.body, 100), '/mypage/messages/' || v_thread.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_locapass_staff_dm_messages_after_insert on public.locapass_staff_dm_messages;
create trigger trg_locapass_staff_dm_messages_after_insert
  after insert on public.locapass_staff_dm_messages
  for each row execute function public.locapass_staff_dm_messages_after_insert();

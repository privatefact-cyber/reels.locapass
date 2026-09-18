-- 一般ユーザー向けの通知(ベルマーク/お知らせ一覧)。お気に入り店舗の新規キャスト・
-- 新規イベント・新着リール、お気に入りキャストの新着リール、店舗からのDM、
-- 運営からのお知らせをここに集約する。
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('new_cast', 'new_event', 'new_shop_reel', 'new_cast_reel', 'shop_message', 'admin_message')),
  title text not null,
  body text,
  url text,
  shop_id uuid references public.shops(id) on delete set null,
  read_at timestamptz,
  push_dispatched_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_created_at_idx on public.notifications(user_id, created_at desc);
create index notifications_user_id_unread_idx on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "user view own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

-- 既読フラグの更新のみ許可(本文の改ざんは不可)。insert/deleteはservice role
-- (トリガー・店舗ダッシュボード・管理コンソールのサーバーアクション)経由のみ。
create policy "user mark own notifications read"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- カテゴリ別のプッシュON/OFF設定。運営からのお知らせ(admin_message)は重要度が高いため
-- 対象外(トグル無し・常に配信)。
create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_cast boolean not null default true,
  new_event boolean not null default true,
  new_shop_reel boolean not null default true,
  new_cast_reel boolean not null default true,
  shop_message boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "user manage own notification preferences"
  on public.notification_preferences for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 新規登録ユーザーにデフォルト設定行を作る(00037_general_user_mypage.sqlのhandle_new_userを拡張)。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id) values (new.id)
  on conflict (id) do nothing;
  insert into public.notification_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 既存ユーザー分をバックフィル。
insert into public.notification_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- notificationsへのINSERTをきっかけに、Push配信API(/api/push/dispatch)をpg_net経由で
-- 非同期に叩く(fire-and-forget、レスポンスは待たない)。このSupabaseプロジェクトでは
-- pg_net(http_post)がnet/publicどちらのスキーマに入っているか環境依存のため、
-- 実体を動的に探して呼び出す。
create or replace function public.dispatch_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'http_post'
  limit 1;

  if v_schema is not null then
    execute format(
      'select %I.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb)',
      v_schema,
      'https://luxela.jp/api/push/dispatch',
      jsonb_build_object('notification_id', new.id)::text,
      jsonb_build_object('Content-Type', 'application/json')::text
    );
  end if;

  return new;
end;
$$;

create trigger trg_notifications_dispatch_push
  after insert on public.notifications
  for each row
  execute function public.dispatch_push_for_notification();

-- お気に入り店舗に新規キャストが追加されたら、その店舗をお気に入り登録中の全ユーザーに通知。
create or replace function public.notify_new_cast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_name text;
begin
  select name into v_shop_name from public.shops where id = new.shop_id;

  insert into public.notifications (user_id, type, title, body, url, shop_id)
  select f.user_id, 'new_cast',
         coalesce(v_shop_name, 'お気に入り店舗') || 'に新しいキャストが入りました',
         new.name, '/cast/' || new.id, new.shop_id
  from public.user_shop_favorites f
  where f.shop_id = new.shop_id;

  return new;
end;
$$;

create trigger trg_cast_members_notify_new_cast
  after insert on public.cast_members
  for each row
  execute function public.notify_new_cast();

-- お気に入り店舗に新規イベントが追加されたら通知。
create or replace function public.notify_new_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_name text;
begin
  select name into v_shop_name from public.shops where id = new.shop_id;

  insert into public.notifications (user_id, type, title, body, url, shop_id)
  select f.user_id, 'new_event',
         coalesce(v_shop_name, 'お気に入り店舗') || 'の新着イベント',
         new.title, '/shops/' || new.shop_id, new.shop_id
  from public.user_shop_favorites f
  where f.shop_id = new.shop_id;

  return new;
end;
$$;

create trigger trg_shop_events_notify_new_event
  after insert on public.shop_events
  for each row
  execute function public.notify_new_event();

-- 新着リール公開時、店舗のお気に入りユーザーとキャストのフォロワー双方に通知。
-- reelsは常にstatus='published'で作成される(下書き機能は無い)想定だが、念のため確認する。
create or replace function public.notify_new_reel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_name text;
  v_cast_name text;
begin
  if new.status <> 'published' then
    return new;
  end if;

  select name into v_shop_name from public.shops where id = new.shop_id;

  insert into public.notifications (user_id, type, title, body, url, shop_id)
  select f.user_id, 'new_shop_reel',
         coalesce(v_shop_name, 'お気に入り店舗') || 'の新着リール',
         new.caption, '/shops/' || new.shop_id || '/reels?start=' || new.id, new.shop_id
  from public.user_shop_favorites f
  where f.shop_id = new.shop_id;

  if new.cast_id is not null then
    select name into v_cast_name from public.cast_members where id = new.cast_id;

    insert into public.notifications (user_id, type, title, body, url, shop_id)
    select flw.user_id, 'new_cast_reel',
           coalesce(v_cast_name, 'フォロー中のキャスト') || 'の新着リール',
           new.caption, '/cast/' || new.cast_id || '/reels?start=' || new.id, new.shop_id
    from public.user_cast_follows flw
    where flw.cast_id = new.cast_id;
  end if;

  return new;
end;
$$;

create trigger trg_reels_notify_new_reel
  after insert on public.reels
  for each row
  execute function public.notify_new_reel();

revoke all on function public.handle_new_user() from public;
revoke all on function public.dispatch_push_for_notification() from public;
revoke all on function public.notify_new_cast() from public;
revoke all on function public.notify_new_event() from public;
revoke all on function public.notify_new_reel() from public;

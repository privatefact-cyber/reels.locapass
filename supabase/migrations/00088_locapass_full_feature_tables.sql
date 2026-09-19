-- =====================================================================
-- LUXELA本家の店舗運用・表側機能の受け皿を locapass_ テーブルとして用意する(LUXELAのデータは共有しない)。
--   写真(media) / 出勤(schedules) / 日記(cast_diary_entries) / リールのキャスト・スタッフ紐付け・ピン留め・
--   コメント可否 / コメント(reel_comments・banned_users・cast_blocked_users) / 料金表(shop_price_items) /
--   イベント投稿 / 問い合わせ(shop_inquiries・messages) / 応募者・与信照会(applicants・blacklists) /
--   お知らせ(notifications・push_subscriptions) / キャストのフォロー(user_cast_follows) / 広告(ads)
-- 列・制約・RLSは本家と同じ形にし、権限判定だけ locapass の関数(locapass_is_shop_admin 等)に置き換える。
-- =====================================================================

-- ---------------------------------------------------------------------
-- リール: キャスト/スタッフの紐付け・ピン留め・コメント可否(本家 reels と同じ列)
-- ---------------------------------------------------------------------
alter table public.locapass_reels
  add column if not exists cast_id uuid references public.locapass_cast_members(id) on delete set null,
  add column if not exists posted_by_staff_id uuid references public.locapass_shop_staff_members(id) on delete set null,
  add column if not exists pinned_at timestamptz,
  add column if not exists is_comments_enabled boolean not null default true;
create index if not exists locapass_reels_cast_id_idx on public.locapass_reels (cast_id) where cast_id is not null;

-- キャスト/スタッフの投稿は、本人の所属店舗に固定する(本家 set_reel_shop_id と同じ)。
create or replace function public.locapass_reels_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cast_id is not null then
    select shop_id into new.shop_id from locapass_cast_members where id = new.cast_id;
  elsif new.posted_by_staff_id is not null then
    select shop_id into new.shop_id from locapass_shop_staff_members where id = new.posted_by_staff_id;
  end if;
  if new.shop_id is null and new.author_url is not null then
    select id into new.shop_id from locapass_shops where wp_author_url = new.author_url;
  end if;
  if new.shop_id is not null then
    select portal_id into new.portal_id from locapass_shops where id = new.shop_id;
  end if;
  if new.published_at is null then
    new.published_at := coalesce(new.wp_created_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- キャスト本人の投稿は cast_id=本人 のものだけ(00086の created_by 判定を cast_id 判定に置き換え)。
drop policy if exists "reels cast insert own shop" on public.locapass_reels;
drop policy if exists "reels cast read own" on public.locapass_reels;
drop policy if exists "reels cast delete own" on public.locapass_reels;
create policy "reels cast insert own" on public.locapass_reels for insert to authenticated
  with check (cast_id is not null and cast_id = locapass_current_cast_id());
create policy "reels cast read own" on public.locapass_reels for select to authenticated
  using (cast_id is not null and cast_id = locapass_current_cast_id());
create policy "reels cast update own" on public.locapass_reels for update to authenticated
  using (cast_id is not null and cast_id = locapass_current_cast_id())
  with check (cast_id is not null and cast_id = locapass_current_cast_id());
create policy "reels cast delete own" on public.locapass_reels for delete to authenticated
  using (cast_id is not null and cast_id = locapass_current_cast_id());

-- 本家 cast_ids_with_active_story
create or replace function public.locapass_cast_ids_with_active_story(p_cast_ids uuid[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct cast_id from public.locapass_reels
  where cast_id = any(p_cast_ids) and reel_type = 'story' and status = 'publish' and expires_at > now();
$$;

-- ---------------------------------------------------------------------
-- 写真(本家 media)
-- ---------------------------------------------------------------------
create table public.locapass_media (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid references public.locapass_cast_members(id) on delete cascade,
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  url text not null,
  display_order integer not null default 0
);
create index locapass_media_cast_id_idx on public.locapass_media (cast_id);
alter table public.locapass_media enable row level security;
create policy "media public read of active shops" on public.locapass_media for select to anon, authenticated
  using (exists (select 1 from public.locapass_shops s where s.id = shop_id and s.status = 'active'));
create policy "media manage by shop admin" on public.locapass_media for all to authenticated
  using (locapass_is_shop_admin(shop_id)) with check (locapass_is_shop_admin(shop_id));

-- ---------------------------------------------------------------------
-- 出勤(本家 schedules)。店舗(shop_admin)に加え、仕様どおり staff の出勤トグル・cast 本人の出勤登録も許可
-- ---------------------------------------------------------------------
create table public.locapass_schedules (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.locapass_cast_members(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  is_working_today boolean not null default false
);
create index locapass_schedules_cast_date_idx on public.locapass_schedules (cast_id, date);
alter table public.locapass_schedules enable row level security;
create policy "schedules public read of active shops" on public.locapass_schedules for select to anon, authenticated
  using (exists (select 1 from public.locapass_cast_members c join public.locapass_shops s on s.id = c.shop_id
                 where c.id = cast_id and s.status = 'active'));
create policy "schedules manage by shop staff" on public.locapass_schedules for all to authenticated
  using (exists (select 1 from public.locapass_cast_members c where c.id = cast_id and locapass_is_shop_staff(c.shop_id)))
  with check (exists (select 1 from public.locapass_cast_members c where c.id = cast_id and locapass_is_shop_staff(c.shop_id)));
create policy "schedules manage by cast self" on public.locapass_schedules for all to authenticated
  using (cast_id = locapass_current_cast_id()) with check (cast_id = locapass_current_cast_id());

-- ---------------------------------------------------------------------
-- 日記(本家 cast_diary_entries)
-- ---------------------------------------------------------------------
create table public.locapass_cast_diary_entries (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.locapass_cast_members(id) on delete cascade,
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  title text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index locapass_cast_diary_entries_cast_idx on public.locapass_cast_diary_entries (cast_id, created_at desc);
alter table public.locapass_cast_diary_entries enable row level security;
create policy "diary public read of active shops" on public.locapass_cast_diary_entries for select to anon, authenticated
  using (exists (select 1 from public.locapass_shops s where s.id = shop_id and s.status = 'active'));
create policy "diary manage by shop admin" on public.locapass_cast_diary_entries for all to authenticated
  using (locapass_is_shop_admin(shop_id)) with check (locapass_is_shop_admin(shop_id));

create or replace function public.locapass_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger locapass_cast_diary_entries_set_updated_at before update on public.locapass_cast_diary_entries
  for each row execute function public.locapass_set_updated_at();

-- ---------------------------------------------------------------------
-- 料金表(本家 shop_price_items)
-- ---------------------------------------------------------------------
create table public.locapass_shop_price_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  name text not null,
  duration_minutes integer,
  price integer not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  name_translations jsonb not null default '{}'::jsonb
);
create index locapass_shop_price_items_shop_idx on public.locapass_shop_price_items (shop_id, display_order);
alter table public.locapass_shop_price_items enable row level security;
create policy "price items public read of active shops" on public.locapass_shop_price_items for select to anon, authenticated
  using (exists (select 1 from public.locapass_shops s where s.id = shop_id and s.status = 'active'));
create policy "price items read by shop staff" on public.locapass_shop_price_items for select to authenticated
  using (locapass_is_shop_staff(shop_id));
create policy "price items manage by shop admin" on public.locapass_shop_price_items for all to authenticated
  using (locapass_is_shop_admin(shop_id)) with check (locapass_is_shop_admin(shop_id));

-- ---------------------------------------------------------------------
-- イベント投稿(本家 shop_events と同じ権限: 店舗は全件、staff は自分の投稿のみ)
-- ---------------------------------------------------------------------
alter table public.locapass_shop_events
  add column if not exists created_by_staff_id uuid references public.locapass_shop_staff_members(id) on delete set null,
  add column if not exists translations jsonb not null default '{}'::jsonb;
create policy "events read by shop staff" on public.locapass_shop_events for select to authenticated
  using (locapass_is_shop_staff(shop_id));
create policy "events manage by shop admin" on public.locapass_shop_events for all to authenticated
  using (locapass_is_shop_admin(shop_id)) with check (locapass_is_shop_admin(shop_id));
create policy "events staff insert own" on public.locapass_shop_events for insert to authenticated
  with check (shop_id = (select shop_id from public.locapass_shop_staff_members where id = locapass_current_staff_member_id())
              and created_by_staff_id = locapass_current_staff_member_id());
create policy "events staff update own" on public.locapass_shop_events for update to authenticated
  using (created_by_staff_id = locapass_current_staff_member_id())
  with check (created_by_staff_id = locapass_current_staff_member_id());
create policy "events staff delete own" on public.locapass_shop_events for delete to authenticated
  using (created_by_staff_id = locapass_current_staff_member_id());
create trigger locapass_shop_events_set_updated_at before update on public.locapass_shop_events
  for each row execute function public.locapass_set_updated_at();

-- ---------------------------------------------------------------------
-- 問い合わせ(本家 shop_inquiries / shop_inquiry_messages と同じ。お客様側は viewer_id で本人確認)
-- ---------------------------------------------------------------------
create table public.locapass_shop_inquiries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  viewer_id uuid not null,
  customer_name text,
  contact text,
  status text not null default 'open' check (status in ('open', 'responded', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index locapass_shop_inquiries_shop_idx on public.locapass_shop_inquiries (shop_id, updated_at desc);
create table public.locapass_shop_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.locapass_shop_inquiries(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'shop')),
  shop_admin_user_id uuid references auth.users(id) on delete set null,
  staff_member_id uuid references public.locapass_shop_staff_members(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index locapass_shop_inquiry_messages_inquiry_idx on public.locapass_shop_inquiry_messages (inquiry_id, created_at);
alter table public.locapass_shop_inquiries enable row level security;
alter table public.locapass_shop_inquiry_messages enable row level security;
create policy "inquiries read by shop staff" on public.locapass_shop_inquiries for select to authenticated
  using (locapass_is_shop_staff(shop_id));
create policy "inquiries update by shop staff" on public.locapass_shop_inquiries for update to authenticated
  using (locapass_is_shop_staff(shop_id)) with check (locapass_is_shop_staff(shop_id));
create policy "inquiry messages read by shop staff" on public.locapass_shop_inquiry_messages for select to authenticated
  using (exists (select 1 from public.locapass_shop_inquiries i where i.id = inquiry_id and locapass_is_shop_staff(i.shop_id)));
create policy "inquiry messages reply by shop staff" on public.locapass_shop_inquiry_messages for insert to authenticated
  with check (sender_type = 'shop'
              and exists (select 1 from public.locapass_shop_inquiries i where i.id = inquiry_id and locapass_is_shop_staff(i.shop_id))
              and (staff_member_id is null or staff_member_id = locapass_current_staff_member_id()));

create trigger locapass_shop_inquiries_set_updated_at before update on public.locapass_shop_inquiries
  for each row execute function public.locapass_set_updated_at();
create or replace function public.locapass_mark_inquiry_status_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.locapass_shop_inquiries
  set status = case when new.sender_type = 'shop' then 'responded' else 'open' end, updated_at = now()
  where id = new.inquiry_id;
  return new;
end;
$$;
create trigger locapass_shop_inquiry_messages_mark_status after insert on public.locapass_shop_inquiry_messages
  for each row execute function public.locapass_mark_inquiry_status_on_message();

create or replace function public.locapass_create_shop_inquiry(
  p_shop_id uuid, p_viewer_id uuid, p_customer_name text, p_contact text, p_body text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inquiry_id uuid;
begin
  if p_body is null or length(trim(p_body)) = 0 then raise exception 'message body is required'; end if;
  if not exists (select 1 from public.locapass_shops where id = p_shop_id and status = 'active') then
    raise exception 'shop not found';
  end if;
  insert into public.locapass_shop_inquiries (shop_id, viewer_id, customer_name, contact)
  values (p_shop_id, p_viewer_id, nullif(trim(p_customer_name), ''), nullif(trim(p_contact), ''))
  returning id into v_inquiry_id;
  insert into public.locapass_shop_inquiry_messages (inquiry_id, sender_type, body) values (v_inquiry_id, 'customer', p_body);
  return v_inquiry_id;
end;
$$;

create or replace function public.locapass_get_inquiry_thread(p_inquiry_id uuid, p_viewer_id uuid)
returns table(id uuid, shop_id uuid, shop_name text, status text, created_at timestamptz, messages jsonb)
language sql stable security definer set search_path = public as $$
  select i.id, i.shop_id, s.name, i.status, i.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('senderType', m.sender_type, 'body', m.body, 'createdAt', m.created_at)
                               order by m.created_at)
              from public.locapass_shop_inquiry_messages m where m.inquiry_id = i.id), '[]'::jsonb)
  from public.locapass_shop_inquiries i
  join public.locapass_shops s on s.id = i.shop_id
  where i.id = p_inquiry_id and i.viewer_id = p_viewer_id;
$$;

create or replace function public.locapass_add_inquiry_message(p_inquiry_id uuid, p_viewer_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_body is null or length(trim(p_body)) = 0 then raise exception 'message body is required'; end if;
  if not exists (select 1 from public.locapass_shop_inquiries where id = p_inquiry_id and viewer_id = p_viewer_id) then
    raise exception 'inquiry not found';
  end if;
  insert into public.locapass_shop_inquiry_messages (inquiry_id, sender_type, body) values (p_inquiry_id, 'customer', p_body);
end;
$$;

-- ---------------------------------------------------------------------
-- 応募者・与信照会(本家 applicants / blacklists / check_person_risk)。照会先は locapass の登録分のみ
-- ---------------------------------------------------------------------
create table public.locapass_applicants (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  name text not null,
  phone text not null,
  dob date,
  status text not null default 'applied' check (status in ('applied', 'hired', 'rejected')),
  last_check_match_level text,
  last_check_hit_count integer,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.locapass_applicants enable row level security;
create policy "applicants manage by shop admin" on public.locapass_applicants for all to authenticated
  using (locapass_is_shop_admin(shop_id)) with check (locapass_is_shop_admin(shop_id));
create trigger locapass_applicants_set_updated_at before update on public.locapass_applicants
  for each row execute function public.locapass_set_updated_at();

create table public.locapass_blacklists (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('customer', 'cast')),
  risk_level integer not null check (risk_level in (1, 2, 3)),
  reason_category text,
  registered_by_shop_id uuid not null references public.locapass_shops(id),
  status text not null default 'active' check (status in ('active', 'resolved')),
  resolved_at timestamptz,
  resolved_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  phone_hash text not null,
  name_hash text,
  dob_hash text,
  constraint locapass_blacklists_cast_requires_name_dob check (target_type = 'customer' or (name_hash is not null and dob_hash is not null))
);
-- 生の照会データは誰にも直接読ませない(本家と同じく件数と一致度だけを関数で返す)。
alter table public.locapass_blacklists enable row level security;

create or replace function public.locapass_check_person_risk(
  p_phone_hash text, p_name_hash text, p_dob_hash text, p_target_type text default 'customer'
) returns table(match_level text, max_risk_level integer, hit_count integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not exists (select 1 from public.locapass_shop_admins where user_id = auth.uid())
     and not exists (select 1 from public.locapass_portal_admins where user_id = auth.uid())
     and not locapass_is_super_admin() then
    raise exception 'not allowed';
  end if;

  return query
  with matches as (
    select b.risk_level,
      ((case when b.phone_hash is not null and p_phone_hash is not null and b.phone_hash = p_phone_hash then 1 else 0 end) +
       (case when b.name_hash is not null and p_name_hash is not null and b.name_hash = p_name_hash then 1 else 0 end) +
       (case when b.dob_hash is not null and p_dob_hash is not null and b.dob_hash = p_dob_hash then 1 else 0 end)) as match_count
    from public.locapass_blacklists b
    where b.target_type = p_target_type and b.status = 'active'
  )
  select
    case when count(*) filter (where m.match_count >= 2) > 0 then 'flagged'
         when count(*) filter (where m.match_count = 1) > 0 then 'caution'
         else 'none' end::text,
    coalesce(max(m.risk_level) filter (where m.match_count >= 2), max(m.risk_level) filter (where m.match_count = 1))::integer,
    case when count(*) filter (where m.match_count >= 2) > 0 then (count(*) filter (where m.match_count >= 2))::integer
         when count(*) filter (where m.match_count = 1) > 0 then (count(*) filter (where m.match_count = 1))::integer
         else 0 end
  from matches m;
end;
$$;

-- ---------------------------------------------------------------------
-- コメント(本家 reel_comments / banned_users / cast_blocked_users と同じ規則)
-- ---------------------------------------------------------------------
create table public.locapass_banned_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  banned_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.locapass_banned_users enable row level security;
create policy "banned users manage by super admin" on public.locapass_banned_users for all to authenticated
  using (locapass_is_super_admin()) with check (locapass_is_super_admin());

create table public.locapass_cast_blocked_users (
  cast_id uuid not null references public.locapass_cast_members(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cast_id, blocked_user_id)
);
alter table public.locapass_cast_blocked_users enable row level security;
create policy "cast manage own blocks" on public.locapass_cast_blocked_users for all to authenticated
  using (cast_id = locapass_current_cast_id()) with check (cast_id = locapass_current_cast_id());
create policy "super admin manage all blocks" on public.locapass_cast_blocked_users for all to authenticated
  using (locapass_is_super_admin()) with check (locapass_is_super_admin());

create table public.locapass_reel_comments (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.locapass_reels(id) on delete cascade,
  author_type text not null check (author_type in ('customer', 'staff', 'cast')),
  user_id uuid references auth.users(id) on delete cascade,
  staff_member_id uuid references public.locapass_shop_staff_members(id) on delete set null,
  cast_id uuid references public.locapass_cast_members(id) on delete set null,
  parent_comment_id uuid references public.locapass_reel_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 15),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  constraint locapass_reel_comments_author_shape check (
    (author_type = 'customer' and user_id is not null and staff_member_id is null and cast_id is null and parent_comment_id is null)
    or (author_type = 'staff' and staff_member_id is not null and cast_id is null)
    or (author_type = 'cast' and cast_id is not null and staff_member_id is null and parent_comment_id is not null)
  )
);
create index locapass_reel_comments_reel_idx on public.locapass_reel_comments (reel_id, created_at);
alter table public.locapass_reel_comments enable row level security;

create or replace function public.locapass_set_reel_comment_user_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_type = 'customer' then new.user_id := auth.uid(); end if;
  return new;
end;
$$;
create trigger locapass_reel_comments_set_user_id before insert on public.locapass_reel_comments
  for each row execute function public.locapass_set_reel_comment_user_id();

create or replace function public.locapass_reject_reel_comment_ng_words()
returns trigger language plpgsql set search_path = public as $$
declare
  ng_words text[] := array['死ね', '殺す', 'ブス', '晒す', 'きもい', 'ぶさいく', 'デブス'];
  w text;
begin
  foreach w in array ng_words loop
    if new.body like '%' || w || '%' then raise exception 'ng_word_detected' using errcode = 'P0001'; end if;
  end loop;
  return new;
end;
$$;
create trigger locapass_reel_comments_ng_word_check before insert or update of body on public.locapass_reel_comments
  for each row execute function public.locapass_reject_reel_comment_ng_words();

create or replace function public.locapass_customer_has_commented_on_reel(p_reel_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.locapass_reel_comments c
                 where c.reel_id = p_reel_id and c.author_type = 'customer' and c.user_id = p_user_id);
$$;
create or replace function public.locapass_cast_has_replied_to_comment(p_parent_comment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.locapass_reel_comments r
                 where r.parent_comment_id = p_parent_comment_id and r.author_type = 'cast');
$$;
create or replace function public.locapass_is_own_reel_customer_comment(p_comment_id uuid, p_reel_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.locapass_reel_comments parent
    join public.locapass_reels r on r.id = parent.reel_id
    where parent.id = p_comment_id and parent.reel_id = p_reel_id and parent.author_type = 'customer'
      and r.cast_id = locapass_current_cast_id() and r.is_comments_enabled = true
  );
$$;

create policy "read visible comments of published reels" on public.locapass_reel_comments for select to anon, authenticated
  using (
    is_deleted = false
    and exists (select 1 from public.locapass_reels r join public.locapass_shops s on s.id = r.shop_id
                where r.id = reel_id and r.status = 'publish' and s.status = 'active')
    and (author_type <> 'customer' or user_id = auth.uid()
         or not exists (select 1 from public.locapass_reels r2 join public.locapass_cast_blocked_users b on b.cast_id = r2.cast_id
                        where r2.id = reel_id and b.blocked_user_id = locapass_reel_comments.user_id))
  );
create policy "comments read by shop staff" on public.locapass_reel_comments for select to authenticated
  using (exists (select 1 from public.locapass_reels r where r.id = reel_id and locapass_is_shop_staff(r.shop_id)));
create policy "comments read by cast on own reels" on public.locapass_reel_comments for select to authenticated
  using (exists (select 1 from public.locapass_reels r where r.id = reel_id and r.cast_id = locapass_current_cast_id()));
create policy "comments read by super admin" on public.locapass_reel_comments for select to authenticated
  using (locapass_is_super_admin());
create policy "customer add one comment per reel" on public.locapass_reel_comments for insert to authenticated
  with check (
    author_type = 'customer' and parent_comment_id is null
    and not exists (select 1 from public.locapass_banned_users b where b.user_id = auth.uid())
    and exists (select 1 from public.locapass_reels r join public.locapass_shops s on s.id = r.shop_id
                where r.id = reel_id and r.status = 'publish' and s.status = 'active' and r.is_comments_enabled = true)
    and not locapass_customer_has_commented_on_reel(reel_id, auth.uid())
  );
create policy "author soft delete own comment" on public.locapass_reel_comments for update to authenticated
  using (author_type = 'customer' and user_id = auth.uid())
  with check (author_type = 'customer' and user_id = auth.uid());
create policy "cast reply once per comment on own reel" on public.locapass_reel_comments for insert to authenticated
  with check (author_type = 'cast' and cast_id = locapass_current_cast_id() and parent_comment_id is not null
              and locapass_is_own_reel_customer_comment(parent_comment_id, reel_id)
              and not locapass_cast_has_replied_to_comment(parent_comment_id));
create policy "cast delete comments on own reel" on public.locapass_reel_comments for update to authenticated
  using (exists (select 1 from public.locapass_reels r where r.id = reel_id and r.cast_id = locapass_current_cast_id()))
  with check (exists (select 1 from public.locapass_reels r where r.id = reel_id and r.cast_id = locapass_current_cast_id()));
create policy "staff reply as own shop" on public.locapass_reel_comments for insert to authenticated
  with check (author_type = 'staff' and staff_member_id = locapass_current_staff_member_id()
              and exists (select 1 from public.locapass_reels r where r.id = reel_id
                          and r.shop_id = (select shop_id from public.locapass_shop_staff_members where id = locapass_current_staff_member_id())));
create policy "shop admin delete comments of own shop reels" on public.locapass_reel_comments for update to authenticated
  using (exists (select 1 from public.locapass_reels r where r.id = reel_id and locapass_is_shop_admin(r.shop_id)))
  with check (exists (select 1 from public.locapass_reels r where r.id = reel_id and locapass_is_shop_admin(r.shop_id)));
create policy "super admin delete any comment" on public.locapass_reel_comments for update to authenticated
  using (locapass_is_super_admin()) with check (locapass_is_super_admin());

-- ---------------------------------------------------------------------
-- キャストのフォロー(本家 user_cast_follows)と、フォロワー数/お気に入り数
-- ---------------------------------------------------------------------
create table public.locapass_cast_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  cast_id uuid not null references public.locapass_cast_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, cast_id)
);
alter table public.locapass_cast_follows enable row level security;
create policy "user manage own cast follows" on public.locapass_cast_follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.locapass_count_cast_followers(p_cast_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.locapass_cast_follows where cast_id = p_cast_id;
$$;
create or replace function public.locapass_count_shop_favorites(p_shop_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.locapass_shop_favorites where shop_id = p_shop_id;
$$;
-- 店舗管理画面の「お客様へのメッセージ」送信先(お気に入り登録者)。本家はservice roleで読んでいる。
create or replace function public.locapass_list_shop_favorite_users(p_shop_id uuid)
returns table(user_id uuid, nickname text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not locapass_is_shop_admin(p_shop_id) then raise exception 'forbidden'; end if;
  return query
    select f.member_id, coalesce(m.nickname, 'ゲスト'), f.created_at
    from public.locapass_shop_favorites f
    left join public.locapass_members m on m.id = f.member_id
    where f.shop_id = p_shop_id
    order by f.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- お知らせ(本家 notifications / push_subscriptions)
-- ---------------------------------------------------------------------
create table public.locapass_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('new_cast', 'new_event', 'new_shop_reel', 'new_cast_reel', 'shop_message', 'admin_message')),
  title text not null,
  body text,
  url text,
  shop_id uuid references public.locapass_shops(id) on delete set null,
  read_at timestamptz,
  push_dispatched_at timestamptz,
  created_at timestamptz not null default now()
);
create index locapass_notifications_user_idx on public.locapass_notifications (user_id, created_at desc);
alter table public.locapass_notifications enable row level security;
create policy "user view own notifications" on public.locapass_notifications for select to authenticated
  using (user_id = auth.uid());
create policy "user mark own notifications read" on public.locapass_notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.locapass_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.locapass_push_subscriptions enable row level security;
create policy "user manage own push subscriptions" on public.locapass_push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 本家と同じく、お知らせが入ったらプッシュ配信APIを呼ぶ(pg_net があるときのみ)。
create or replace function public.locapass_dispatch_push_for_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_schema text;
begin
  select n.nspname into v_schema from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'http_post' limit 1;
  if v_schema is not null then
    execute format(
      'select %I.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb)',
      v_schema,
      'https://reels.locapass.net/api/push/dispatch',
      jsonb_build_object('notification_id', new.id)::text,
      jsonb_build_object('Content-Type', 'application/json')::text
    );
  end if;
  return new;
end;
$$;
create trigger locapass_notifications_dispatch_push after insert on public.locapass_notifications
  for each row execute function public.locapass_dispatch_push_for_notification();

-- 店舗 → お気に入り登録者へのメッセージ(本家 sendShopMessage と同じ確認をDB側で行う)
create or replace function public.locapass_send_shop_message(p_shop_id uuid, p_body text, p_target_user_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_shop_name text;
  v_count integer;
begin
  if not locapass_is_shop_admin(p_shop_id) then raise exception 'forbidden'; end if;
  if p_body is null or length(trim(p_body)) = 0 then raise exception '本文を入力してください'; end if;
  select name into v_shop_name from public.locapass_shops where id = p_shop_id;

  if p_target_user_id is not null
     and not exists (select 1 from public.locapass_shop_favorites where shop_id = p_shop_id and member_id = p_target_user_id) then
    raise exception 'お気に入り登録していないユーザーには送信できません';
  end if;

  insert into public.locapass_notifications (user_id, type, title, body, url, shop_id)
  select f.member_id, 'shop_message', v_shop_name || 'からのメッセージ', trim(p_body), '/shops/' || p_shop_id, p_shop_id
  from public.locapass_shop_favorites f
  where f.shop_id = p_shop_id and (p_target_user_id is null or f.member_id = p_target_user_id);
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception '送信先のお気に入りユーザーがいません'; end if;
  return v_count;
end;
$$;

-- 運営(super_admin) → 全会員への一斉お知らせ(本家 sendAdminBroadcast と同じ)
create or replace function public.locapass_send_admin_broadcast(p_title text, p_body text default null, p_url text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not locapass_is_super_admin() then raise exception 'forbidden'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'タイトルを入力してください'; end if;
  insert into public.locapass_notifications (user_id, type, title, body, url)
  select m.id, 'admin_message', trim(p_title), nullif(trim(coalesce(p_body, '')), ''), nullif(trim(coalesce(p_url, '')), '')
  from public.locapass_members m;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 本家の自動お知らせ(お気に入り店舗の新人キャスト・新着イベント・新着リール、フォロー中キャストの新着リール)
create or replace function public.locapass_notify_new_cast()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_shop_name text;
begin
  select name into v_shop_name from public.locapass_shops where id = new.shop_id;
  insert into public.locapass_notifications (user_id, type, title, body, url, shop_id)
  select f.member_id, 'new_cast', coalesce(v_shop_name, 'お気に入り店舗') || 'に新しいキャストが入りました',
         new.name, '/cast/' || new.id, new.shop_id
  from public.locapass_shop_favorites f where f.shop_id = new.shop_id;
  return new;
end;
$$;
create trigger locapass_cast_members_notify_new_cast after insert on public.locapass_cast_members
  for each row execute function public.locapass_notify_new_cast();

create or replace function public.locapass_notify_new_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_shop_name text;
begin
  select name into v_shop_name from public.locapass_shops where id = new.shop_id;
  insert into public.locapass_notifications (user_id, type, title, body, url, shop_id)
  select f.member_id, 'new_event', coalesce(v_shop_name, 'お気に入り店舗') || 'の新着イベント',
         new.title, '/shops/' || new.shop_id, new.shop_id
  from public.locapass_shop_favorites f where f.shop_id = new.shop_id;
  return new;
end;
$$;
create trigger locapass_shop_events_notify_new_event after insert on public.locapass_shop_events
  for each row execute function public.locapass_notify_new_event();

create or replace function public.locapass_notify_new_reel()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_shop_name text;
  v_cast_name text;
begin
  if new.status <> 'publish' or new.shop_id is null then return new; end if;
  select name into v_shop_name from public.locapass_shops where id = new.shop_id;
  insert into public.locapass_notifications (user_id, type, title, body, url, shop_id)
  select f.member_id, 'new_shop_reel', coalesce(v_shop_name, 'お気に入り店舗') || 'の新着リール',
         new.caption, '/shops/' || new.shop_id || '/reels?start=' || new.id, new.shop_id
  from public.locapass_shop_favorites f where f.shop_id = new.shop_id;

  if new.cast_id is not null then
    select name into v_cast_name from public.locapass_cast_members where id = new.cast_id;
    insert into public.locapass_notifications (user_id, type, title, body, url, shop_id)
    select flw.user_id, 'new_cast_reel', coalesce(v_cast_name, 'フォロー中のキャスト') || 'の新着リール',
           new.caption, '/cast/' || new.cast_id || '/reels?start=' || new.id, new.shop_id
    from public.locapass_cast_follows flw where flw.cast_id = new.cast_id;
  end if;
  return new;
end;
$$;
create trigger locapass_reels_notify_new_reel after insert on public.locapass_reels
  for each row execute function public.locapass_notify_new_reel();

-- ---------------------------------------------------------------------
-- 広告(本家 ads)。投稿は super_admin のみ
-- ---------------------------------------------------------------------
create table public.locapass_ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  media_type text not null,
  media_url text not null,
  poster_url text,
  link_url text not null,
  frequency integer not null default 10,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.locapass_ads enable row level security;
create policy "ads public read active" on public.locapass_ads for select to anon, authenticated using (is_active = true);
create policy "ads manage by super admin" on public.locapass_ads for all to authenticated
  using (locapass_is_super_admin()) with check (locapass_is_super_admin());

-- ---------------------------------------------------------------------
-- ストレージ(本家 cast-media / id-documents / 広告用)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('locapass-cast-media', 'locapass-cast-media', true),
  ('locapass-id-documents', 'locapass-id-documents', false),
  ('locapass-ads', 'locapass-ads', true)
on conflict (id) do nothing;

create or replace function public.locapass_can_manage_cast_folder(p_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.locapass_cast_members c
                 where c.id::text = p_folder and locapass_is_shop_admin(c.shop_id));
$$;

create policy "locapass cast media public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'locapass-cast-media');
create policy "locapass cast media upload by shop admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'locapass-cast-media' and locapass_can_manage_cast_folder((storage.foldername(name))[1]));
create policy "locapass cast media delete by shop admin" on storage.objects for delete to authenticated
  using (bucket_id = 'locapass-cast-media' and locapass_can_manage_cast_folder((storage.foldername(name))[1]));

create policy "locapass id documents read by shop admin" on storage.objects for select to authenticated
  using (bucket_id = 'locapass-id-documents' and locapass_can_manage_cast_folder((storage.foldername(name))[1]));
create policy "locapass id documents upload by shop admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'locapass-id-documents' and locapass_can_manage_cast_folder((storage.foldername(name))[1]));
create policy "locapass id documents update by shop admin" on storage.objects for update to authenticated
  using (bucket_id = 'locapass-id-documents' and locapass_can_manage_cast_folder((storage.foldername(name))[1]));
create policy "locapass id documents delete by shop admin" on storage.objects for delete to authenticated
  using (bucket_id = 'locapass-id-documents' and locapass_can_manage_cast_folder((storage.foldername(name))[1]));

create policy "locapass ads media public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'locapass-ads');
create policy "locapass ads media upload by super admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'locapass-ads' and locapass_is_super_admin());
create policy "locapass ads media delete by super admin" on storage.objects for delete to authenticated
  using (bucket_id = 'locapass-ads' and locapass_is_super_admin());

-- 既存の locapass-reels バケットの店舗フォルダ判定は、フォルダ名がuuidでないと例外になるため、
-- 安全に判定する関数に置き換える(広告など別フォルダを置いても他の投稿が失敗しないように)。
create or replace function public.locapass_is_shop_staff_folder(p_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.locapass_shops s where s.id::text = p_folder and locapass_is_shop_staff(s.id));
$$;
create or replace function public.locapass_is_cast_shop_folder(p_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(locapass_current_cast_shop_id()::text = p_folder, false);
$$;
alter policy "locapass reels media upload by shop managers" on storage.objects
  with check (bucket_id = 'locapass-reels' and locapass_is_shop_staff_folder((storage.foldername(name))[1]));
alter policy "locapass reels media delete by shop managers" on storage.objects
  using (bucket_id = 'locapass-reels' and locapass_is_shop_staff_folder((storage.foldername(name))[1]));
alter policy "locapass reels media upload by cast" on storage.objects
  with check (bucket_id = 'locapass-reels' and locapass_is_cast_shop_folder((storage.foldername(name))[1]));
alter policy "locapass reels media delete by cast" on storage.objects
  using (bucket_id = 'locapass-reels' and locapass_is_cast_shop_folder((storage.foldername(name))[1]));

-- 関数の実行権限(誰でも呼べる必要がある問い合わせ系以外は、ログインユーザーに限定)
revoke all on function public.locapass_send_shop_message(uuid, text, uuid) from public, anon;
revoke all on function public.locapass_send_admin_broadcast(text, text, text) from public, anon;
revoke all on function public.locapass_list_shop_favorite_users(uuid) from public, anon;
revoke all on function public.locapass_check_person_risk(text, text, text, text) from public, anon;
grant execute on function public.locapass_send_shop_message(uuid, text, uuid) to authenticated;
grant execute on function public.locapass_send_admin_broadcast(text, text, text) to authenticated;
grant execute on function public.locapass_list_shop_favorite_users(uuid) to authenticated;
grant execute on function public.locapass_check_person_risk(text, text, text, text) to authenticated;

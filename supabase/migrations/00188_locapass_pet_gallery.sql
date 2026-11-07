-- ロカわん「うちの子自慢ギャラリー」。2026-11-07。
-- 成長日誌のうち visibility='public' で写真のあるものをギャラリーに並べる(位置は持たない)。
-- 「場所を付けてsnapにも投稿」したものは snap_post_id で LOCAPASS snap(area_photo_posts)とつなぐ。
-- 肉球(いいね)は locapass_pet_diary_likes に1人1回。数は like_count に持つ(並べ替え用)。

alter table public.locapass_pet_diary_entries
  add column if not exists snap_post_id uuid references public.area_photo_posts (id) on delete set null,
  add column if not exists like_count integer not null default 0,
  add column if not exists hidden_at timestamptz;

create index if not exists locapass_pet_diary_gallery_idx
  on public.locapass_pet_diary_entries (created_at desc)
  where visibility = 'public' and hidden_at is null and cardinality(image_paths) > 0;
create index if not exists locapass_pet_diary_gallery_popular_idx
  on public.locapass_pet_diary_entries (like_count desc, created_at desc)
  where visibility = 'public' and hidden_at is null and cardinality(image_paths) > 0;

-- 飼い主は自分の日誌を自分の権限で書き換えられる(owner all)ので、肉球の数・非表示・snapのつながりは
-- サーバー(service role)以外から変えられないようにする(自分の投稿の肉球を水増しできないように)。
create or replace function public.locapass_pet_diary_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.like_count := 0;
    new.hidden_at := null;
    new.snap_post_id := null;
  else
    new.like_count := old.like_count;
    new.hidden_at := old.hidden_at;
    new.snap_post_id := old.snap_post_id;
  end if;
  return new;
end;
$$;
drop trigger if exists locapass_pet_diary_guard on public.locapass_pet_diary_entries;
create trigger locapass_pet_diary_guard before insert or update on public.locapass_pet_diary_entries
  for each row execute function public.locapass_pet_diary_guard();

-- 肉球。書き込みはサーバーだけ(server action が service role で入れる)。本人は自分が押したかだけ読める。
create table if not exists public.locapass_pet_diary_likes (
  entry_id uuid not null references public.locapass_pet_diary_entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);
create index if not exists locapass_pet_diary_likes_user_idx on public.locapass_pet_diary_likes (user_id, created_at desc);
alter table public.locapass_pet_diary_likes enable row level security;
drop policy if exists "pet diary likes own read" on public.locapass_pet_diary_likes;
create policy "pet diary likes own read" on public.locapass_pet_diary_likes for select to authenticated
  using (user_id = auth.uid());

create or replace function public.locapass_pet_diary_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.locapass_pet_diary_entries set like_count = like_count + 1 where id = new.entry_id;
  elsif tg_op = 'DELETE' then
    update public.locapass_pet_diary_entries set like_count = greatest(like_count - 1, 0) where id = old.entry_id;
  end if;
  return null;
end;
$$;
drop trigger if exists locapass_pet_diary_like_count on public.locapass_pet_diary_likes;
create trigger locapass_pet_diary_like_count after insert or delete on public.locapass_pet_diary_likes
  for each row execute function public.locapass_pet_diary_like_count();

-- 通報の対象に日誌(ギャラリーの投稿)を足す
alter table public.locapass_pet_flags drop constraint if exists locapass_pet_flags_target_type_check;
alter table public.locapass_pet_flags add constraint locapass_pet_flags_target_type_check
  check (target_type in ('lost', 'found', 'diary'));

-- きょう誕生日で、ギャラリーに公開した写真がある子(ホームの「きょうお誕生日」用)
create or replace function public.locapass_pet_today_birthdays(p_md text)
returns table (pet_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.id
  from public.locapass_pets p
  join public.locapass_pet_diary_entries d
    on d.pet_id = p.id and d.visibility = 'public' and d.hidden_at is null and cardinality(d.image_paths) > 0
  where p.birthday is not null
    and not coalesce(p.birthday_estimated, false)
    and to_char(p.birthday, 'MM-DD') = p_md
  limit 12;
$$;
revoke execute on function public.locapass_pet_today_birthdays(text) from public, anon, authenticated;
grant execute on function public.locapass_pet_today_birthdays(text) to service_role;

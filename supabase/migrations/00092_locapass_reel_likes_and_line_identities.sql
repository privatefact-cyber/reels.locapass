-- いいね(本家 reel_likes と同じ。未ログインでも端末ごとの viewer_id で1回だけ押せる)。
-- これまで locapass のいいねは LUXELA の reel_likes に書こうとして外部キー違反で保存されていなかった。
create table public.locapass_reel_likes (
  reel_id uuid not null references public.locapass_reels(id) on delete cascade,
  viewer_id uuid not null,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, viewer_id)
);
alter table public.locapass_reel_likes enable row level security;
create policy "anyone read likes" on public.locapass_reel_likes for select to anon, authenticated using (true);
create policy "anyone add own like" on public.locapass_reel_likes for insert to anon, authenticated with check (true);
create policy "anyone remove own like" on public.locapass_reel_likes for delete to anon, authenticated using (true);

create or replace function public.locapass_set_reel_like_user_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;
create trigger locapass_reel_likes_set_user_id before insert on public.locapass_reel_likes
  for each row execute function public.locapass_set_reel_like_user_id();

create or replace function public.locapass_sync_reel_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.locapass_reels set like_count = like_count + 1 where id = new.reel_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.locapass_reels set like_count = greatest(like_count - 1, 0) where id = old.reel_id;
    return old;
  end if;
  return null;
end;
$$;
create trigger locapass_reel_likes_sync_insert after insert on public.locapass_reel_likes
  for each row execute function public.locapass_sync_reel_like_count();
create trigger locapass_reel_likes_sync_delete after delete on public.locapass_reel_likes
  for each row execute function public.locapass_sync_reel_like_count();

-- LINEログインの紐付け(本家 line_identities と同じ。サーバー(service role)だけが読み書きする)。
create table public.locapass_line_identities (
  line_user_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.locapass_line_identities enable row level security;

create or replace function public.locapass_get_user_id_by_email(p_email text)
returns uuid language sql security definer set search_path = public as $$
  select id from auth.users where email = p_email limit 1;
$$;
revoke all on function public.locapass_get_user_id_by_email(text) from public, anon, authenticated;

-- お知らせのカテゴリ別受け取り設定(本家 notification_preferences と同じ列)。本人だけが読み書きできる。
-- 行が無い会員は全カテゴリON扱い(配信側でデフォルトONとして扱う、本家と同じ)。
create table public.locapass_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_cast boolean not null default true,
  new_event boolean not null default true,
  new_shop_reel boolean not null default true,
  new_cast_reel boolean not null default true,
  shop_message boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.locapass_notification_preferences enable row level security;
create policy "user manage own notification preferences" on public.locapass_notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger locapass_notification_preferences_set_updated_at before update on public.locapass_notification_preferences
  for each row execute function public.locapass_set_updated_at();

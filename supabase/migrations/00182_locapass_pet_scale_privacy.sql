-- ワンコ手帳の迷子さがしを、件数が増えても使えるように+個人情報を長く持たないように。2026-11-06。

-- 散歩エリアを最大3か所(自宅・職場・実家など)。旧 locapass_pet_owner_settings.walk_lat/lng から移す(旧列は使わなくなる)。
create table if not exists public.locapass_pet_walk_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  label text,
  created_at timestamptz not null default now()
);
create index if not exists locapass_pet_walk_areas_user_idx on public.locapass_pet_walk_areas (user_id);
create index if not exists locapass_pet_walk_areas_geo_idx on public.locapass_pet_walk_areas (lat, lng);
alter table public.locapass_pet_walk_areas enable row level security;
drop policy if exists "pet walk area owner all" on public.locapass_pet_walk_areas;
create policy "pet walk area owner all" on public.locapass_pet_walk_areas for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into public.locapass_pet_walk_areas (user_id, lat, lng, label)
select s.user_id, s.walk_lat, s.walk_lng, s.walk_area_label
from public.locapass_pet_owner_settings s
where s.walk_lat is not null and s.walk_lng is not null
  and not exists (select 1 from public.locapass_pet_walk_areas w where w.user_id = s.user_id);

-- 「いまいる場所」でも迷子アラートを受け取る(本人が選んだ人だけ)。約100m単位にまるめ、48時間で消す。
alter table public.locapass_pet_owner_settings add column if not exists here_alert_opt_in boolean not null default false;
alter table public.locapass_pet_owner_settings add column if not exists here_lat double precision;
alter table public.locapass_pet_owner_settings add column if not exists here_lng double precision;
alter table public.locapass_pet_owner_settings add column if not exists here_at timestamptz;
create index if not exists locapass_pet_owner_settings_here_idx on public.locapass_pet_owner_settings (here_at) where here_at is not null;

-- 迷子のお知らせ: 飼い主が「まだ探しています」と確認した日時(30日で確認の通知、60日確認がなければ自動終了)と、運営の非表示。
alter table public.locapass_pet_lost_reports add column if not exists last_confirmed_at timestamptz not null default now();
alter table public.locapass_pet_lost_reports add column if not exists check_sent_at timestamptz;
alter table public.locapass_pet_lost_reports add column if not exists hidden_at timestamptz;
alter table public.locapass_pet_found_reports add column if not exists hidden_at timestamptz;
create index if not exists locapass_pet_lost_geo_idx on public.locapass_pet_lost_reports (last_seen_lat, last_seen_lng) where status = 'active';
create index if not exists locapass_pet_found_geo_idx on public.locapass_pet_found_reports (lat, lng) where status = 'open';

-- 不適切の報告(迷子のお知らせ・見つけました通報)。サーバーだけ。
create table if not exists public.locapass_pet_flags (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('lost', 'found')),
  target_id uuid not null,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);
create index if not exists locapass_pet_flags_target_idx on public.locapass_pet_flags (target_type, target_id);
alter table public.locapass_pet_flags enable row level security;

-- 通知の種類を追加(迷子のお知らせの継続確認)。
alter table public.locapass_notifications drop constraint if exists locapass_notifications_type_check;
alter table public.locapass_notifications add constraint locapass_notifications_type_check
  check (type = any (array[
    'new_cast','new_event','new_shop_reel','new_cast_reel','shop_message','admin_message','staff_dm',
    'photo_like','photo_follow',
    'reservation_request','reservation_confirmed','reservation_declined','reservation_cancelled',
    'google_review',
    'pet_reminder','pet_lost_alert','pet_follow_request','pet_follow_approved','pet_sighting',
    'pet_found','pet_found_claim','pet_lost_check'
  ]));

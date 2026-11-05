-- ワンコ手帳(犬の飼い主向け機能、/pet 配下)。2026-11-06。
-- 方針:
--   - 基本は本人だけ。書類(ワクチン等)と通院記録は本人だけで固定。プロフィール・日誌は visibility で後から公開範囲を変えられる。
--   - 本人の読み書きはRLS(owner_id = auth.uid())。他人に見せる部分(名刺ページ・迷子情報・フォロー)はサーバー(service role)が
--     許可した列だけを返す。anon向けのSELECTポリシーは作らない(公開ページはサーバー経由)。
--   - 写真・書類の画像は非公開の置き場(storage: pet-private)に置き、表示はサーバーが発行する期限付きURLだけ。

-- うちの子
create table if not exists public.locapass_pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  breed text,
  sex text not null default 'unknown' check (sex in ('male', 'female', 'unknown')),
  neutered boolean,
  birthday date,
  birthday_estimated boolean not null default false,
  coat_color text,
  weight_kg numeric(5, 2),
  microchip_no text,
  registration_no text,
  allergies text,
  conditions text,
  vet_name text,
  insurance_name text,
  insurance_no text,
  features text,
  avatar_path text,
  cover_path text,
  visibility text not null default 'private' check (visibility in ('private', 'followers', 'public')),
  card_public boolean not null default true,
  tag_code text not null unique,
  is_lost boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists locapass_pets_owner_idx on public.locapass_pets (owner_id, sort_order, created_at);
alter table public.locapass_pets enable row level security;
drop policy if exists "pet owner all" on public.locapass_pets;
create policy "pet owner all" on public.locapass_pets for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 書類(狂犬病の注射済票・鑑札・混合ワクチン証明など)。本人だけ。
create table if not exists public.locapass_pet_documents (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.locapass_pets (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  doc_type text not null check (doc_type in ('rabies', 'license', 'mixed_vaccine', 'other')),
  title text,
  administered_on date,
  expires_on date,
  clinic_name text,
  vaccine_name text,
  registration_no text,
  note text,
  image_path text,
  ai_result jsonb,
  created_at timestamptz not null default now()
);
create index if not exists locapass_pet_documents_pet_idx on public.locapass_pet_documents (pet_id, doc_type, expires_on desc);
create index if not exists locapass_pet_documents_expires_idx on public.locapass_pet_documents (expires_on) where expires_on is not null;
alter table public.locapass_pet_documents enable row level security;
drop policy if exists "pet doc owner all" on public.locapass_pet_documents;
create policy "pet doc owner all" on public.locapass_pet_documents for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 期限のお知らせを送った記録(同じ書類・同じ期限・同じ段階で二重に送らない)。サーバーだけ。
create table if not exists public.locapass_pet_reminder_log (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.locapass_pet_documents (id) on delete cascade,
  expires_on date not null,
  stage text not null,
  sent_at timestamptz not null default now(),
  unique (document_id, expires_on, stage)
);
alter table public.locapass_pet_reminder_log enable row level security;

-- 病気・通院の記録。本人だけ。
create table if not exists public.locapass_pet_medical_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.locapass_pets (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visited_on date not null,
  hospital text,
  symptoms text,
  diagnosis text,
  medicines text,
  cost int,
  note text,
  image_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists locapass_pet_medical_pet_idx on public.locapass_pet_medical_records (pet_id, visited_on desc);
alter table public.locapass_pet_medical_records enable row level security;
drop policy if exists "pet medical owner all" on public.locapass_pet_medical_records;
create policy "pet medical owner all" on public.locapass_pet_medical_records for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 成長日誌(写真・体重・ひとこと)。visibility で後から公開範囲を変えられる。
create table if not exists public.locapass_pet_diary_entries (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.locapass_pets (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  weight_kg numeric(5, 2),
  body text,
  image_paths text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('private', 'followers', 'public')),
  created_at timestamptz not null default now()
);
create index if not exists locapass_pet_diary_pet_idx on public.locapass_pet_diary_entries (pet_id, entry_date desc);
alter table public.locapass_pet_diary_entries enable row level security;
drop policy if exists "pet diary owner all" on public.locapass_pet_diary_entries;
create policy "pet diary owner all" on public.locapass_pet_diary_entries for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 犬用フォロー(人→犬)。飼い主の承認制。読み書きはサーバーだけ。
create table if not exists public.locapass_pet_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users (id) on delete cascade,
  pet_id uuid not null references public.locapass_pets (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (follower_id, pet_id)
);
create index if not exists locapass_pet_follows_pet_idx on public.locapass_pet_follows (pet_id, status);
alter table public.locapass_pet_follows enable row level security;

-- 迷子のお知らせ。公開する連絡先は飼い主が選んで入れる(迷子の間だけ名刺ページに出る)。
create table if not exists public.locapass_pet_lost_reports (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.locapass_pets (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'found', 'closed')),
  last_seen_at timestamptz,
  last_seen_lat double precision,
  last_seen_lng double precision,
  last_seen_address text,
  features text,
  photo_path text,
  contact_phone text,
  contact_line text,
  contact_note text,
  alert_sent_count int not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists locapass_pet_lost_active_idx on public.locapass_pet_lost_reports (status, created_at desc);
create index if not exists locapass_pet_lost_pet_idx on public.locapass_pet_lost_reports (pet_id, created_at desc);
alter table public.locapass_pet_lost_reports enable row level security;
drop policy if exists "pet lost owner all" on public.locapass_pet_lost_reports;
create policy "pet lost owner all" on public.locapass_pet_lost_reports for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 目撃情報(「ここで見た」)。投稿はログイン会員のみ・サーバー経由。
create table if not exists public.locapass_pet_sightings (
  id uuid primary key default gen_random_uuid(),
  lost_report_id uuid not null references public.locapass_pet_lost_reports (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  photo_path text,
  lat double precision not null,
  lng double precision not null,
  address text,
  seen_at timestamptz not null default now(),
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists locapass_pet_sightings_report_idx on public.locapass_pet_sightings (lost_report_id, seen_at desc);
alter table public.locapass_pet_sightings enable row level security;

-- 飼い主の設定(散歩エリア・迷子アラートの受け取り・LINE連携)。本人だけ。
create table if not exists public.locapass_pet_owner_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  walk_lat double precision,
  walk_lng double precision,
  walk_area_label text,
  lost_alert_opt_in boolean not null default true,
  line_user_id text,
  line_linked_at timestamptz,
  line_notify boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.locapass_pet_owner_settings enable row level security;
drop policy if exists "pet settings owner all" on public.locapass_pet_owner_settings;
create policy "pet settings owner all" on public.locapass_pet_owner_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 書類のAI読み取りの回数記録(1人1日の上限=費用の暴走防止)。サーバーだけ。
create table if not exists public.locapass_pet_ai_scans (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists locapass_pet_ai_scans_user_idx on public.locapass_pet_ai_scans (user_id, created_at desc);
alter table public.locapass_pet_ai_scans enable row level security;

-- 非公開の画像置き場。ポリシーは作らない(アップロード・表示ともサーバーが署名URLを発行する)。
insert into storage.buckets (id, name, public)
values ('pet-private', 'pet-private', false)
on conflict (id) do nothing;

-- 通知の種類を追加(期限のお知らせ・迷子アラート・フォロー申請/承認・目撃情報)。
alter table public.locapass_notifications drop constraint if exists locapass_notifications_type_check;
alter table public.locapass_notifications add constraint locapass_notifications_type_check
  check (type = any (array[
    'new_cast','new_event','new_shop_reel','new_cast_reel','shop_message','admin_message','staff_dm',
    'photo_like','photo_follow',
    'reservation_request','reservation_confirmed','reservation_declined','reservation_cancelled',
    'google_review',
    'pet_reminder','pet_lost_alert','pet_follow_request','pet_follow_approved','pet_sighting'
  ]));

-- 「迷子のペットを見つけました!」の通報(保護している/見かけた)。2026-11-06。
-- 迷子のお知らせ(locapass_pet_lost_reports)が出ていない子でも投稿できる。ログイン会員のみ・サーバー経由で投稿。
-- 公開ページ(/pet/found/[id])はサーバーが許可した列だけを返す。本人(投稿者)の行はRLSで本人だけ。
create table if not exists public.locapass_pet_found_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'sighted' check (kind in ('protected', 'sighted')),
  species text not null default 'dog' check (species in ('dog', 'cat', 'other')),
  photo_path text,
  lat double precision not null,
  lng double precision not null,
  address text,
  found_at timestamptz not null default now(),
  features text,
  handed_to text,
  contact_note text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists locapass_pet_found_open_idx on public.locapass_pet_found_reports (status, created_at desc);
create index if not exists locapass_pet_found_reporter_idx on public.locapass_pet_found_reports (reporter_id, created_at desc);
alter table public.locapass_pet_found_reports enable row level security;
drop policy if exists "pet found reporter all" on public.locapass_pet_found_reports;
create policy "pet found reporter all" on public.locapass_pet_found_reports for all to authenticated
  using (reporter_id = auth.uid()) with check (reporter_id = auth.uid());

-- 「うちの子かも!」の記録(同じ人が同じ通報に何度も送らない)。サーバーだけ。
create table if not exists public.locapass_pet_found_claims (
  id bigint generated always as identity primary key,
  found_report_id uuid not null references public.locapass_pet_found_reports (id) on delete cascade,
  claimant_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (found_report_id, claimant_id)
);
alter table public.locapass_pet_found_claims enable row level security;

-- 通知の種類を追加(見つけました通報・うちの子かも)。
alter table public.locapass_notifications drop constraint if exists locapass_notifications_type_check;
alter table public.locapass_notifications add constraint locapass_notifications_type_check
  check (type = any (array[
    'new_cast','new_event','new_shop_reel','new_cast_reel','shop_message','admin_message','staff_dm',
    'photo_like','photo_follow',
    'reservation_request','reservation_confirmed','reservation_declined','reservation_cancelled',
    'google_review',
    'pet_reminder','pet_lost_alert','pet_follow_request','pet_follow_approved','pet_sighting',
    'pet_found','pet_found_claim'
  ]));

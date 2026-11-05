-- ログインなしで「見つけました」通報・目撃情報を送れるようにする(拾った人はアプリも会員登録もしていないため)。2026-11-06。
-- いたずら対策: 送信元IPのハッシュ(生のIPは持たない)で回数制限。ゲストの通報は、送信直後に渡す「管理用リンク」(トークン)で解決・削除できる。
alter table public.locapass_pet_found_reports alter column reporter_id drop not null;
alter table public.locapass_pet_found_reports add column if not exists guest_ip_hash text;
alter table public.locapass_pet_found_reports add column if not exists manage_token_hash text;
create index if not exists locapass_pet_found_guest_ip_idx on public.locapass_pet_found_reports (guest_ip_hash, created_at desc) where guest_ip_hash is not null;

alter table public.locapass_pet_sightings alter column reporter_id drop not null;
alter table public.locapass_pet_sightings add column if not exists guest_ip_hash text;
create index if not exists locapass_pet_sightings_guest_ip_idx on public.locapass_pet_sightings (guest_ip_hash, created_at desc) where guest_ip_hash is not null;

-- ゲストの写真アップロードの回数記録(サーバーだけ)
create table if not exists public.locapass_pet_guest_uploads (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists locapass_pet_guest_uploads_ip_idx on public.locapass_pet_guest_uploads (ip_hash, created_at desc);
alter table public.locapass_pet_guest_uploads enable row level security;

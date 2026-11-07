-- ロカわん「おでかけ」用の外部の施設データ(ドッグラン・動物病院など)。2026-11-07。
-- LOCAPASSのお店(locapass_shops)とは別に持ち、LOCAPASSの地図には出さない(ロカわんのおでかけだけで使う)。
-- 出典ごとに source を持つ。いまは OpenStreetMap(ODbL: 出典表示が必要)のみ。
-- 自治体の動物取扱業の登録簿は、利用条件を確認・許可を得てから source='registry_<自治体>' で追加する。
create table if not exists public.locapass_pet_places (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text not null,
  category text not null check (category in ('dog_run', 'vet', 'pet_shop', 'pet_hotel', 'trimming', 'training', 'other')),
  name text not null,
  address text,
  lat double precision not null,
  lng double precision not null,
  website text,
  opening_hours text,
  attribution text,
  hidden boolean not null default false,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists locapass_pet_places_geo_idx on public.locapass_pet_places (lat, lng) where not hidden;
alter table public.locapass_pet_places enable row level security;
-- 公開ページ(おでかけ・施設ページ)で誰でも見られるように。CLAUDE.md の決まりどおり anon と authenticated の両方に付ける
drop policy if exists "pet places public read" on public.locapass_pet_places;
create policy "pet places public read" on public.locapass_pet_places for select to anon, authenticated using (not hidden);

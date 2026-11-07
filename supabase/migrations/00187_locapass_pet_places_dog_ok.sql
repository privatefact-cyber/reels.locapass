-- ロカわんの取り込み施設に「犬OKのお店」(OpenStreetMapで dog=yes/leashed のカフェ・飲食店)を追加。2026-11-07。
alter table public.locapass_pet_places drop constraint if exists locapass_pet_places_category_check;
alter table public.locapass_pet_places add constraint locapass_pet_places_category_check
  check (category in ('dog_run', 'vet', 'pet_shop', 'pet_hotel', 'trimming', 'training', 'dog_ok', 'other'));

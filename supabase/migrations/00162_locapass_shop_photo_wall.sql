-- 店舗ページの背景「写真の壁」のオーナー設定。
--  photo_wall_enabled: 背景を出すか(既定はオフ)。
--  photo_wall_preset: ダミー写真のプリセット(null=店舗の業種に合わせる)。
-- 列を足すだけで既存の動きは変わらない。更新は既存のlocapass_shopsのRLS(店舗管理者以上)に従う。
alter table public.locapass_shops
  add column if not exists photo_wall_enabled boolean not null default false,
  add column if not exists photo_wall_preset text;

alter table public.locapass_shops drop constraint if exists locapass_shops_photo_wall_preset_check;
alter table public.locapass_shops add constraint locapass_shops_photo_wall_preset_check
  check (photo_wall_preset is null or photo_wall_preset = any (array['cafe','restaurant','izakaya','shopping','sightseeing','stay','pet','beauty','community','other']));

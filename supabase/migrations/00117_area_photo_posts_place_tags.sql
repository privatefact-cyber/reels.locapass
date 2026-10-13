-- エリアフォト投稿に「場所タグ」を追加(2026-10-13)。
-- place_kind: listed=locapass掲載店(venue_id併用) / spot=Googleの場所(穴場、place_idで束ねる) / free=手入力のみ
alter table public.area_photo_posts
  add column if not exists place_id text,
  add column if not exists place_name text,
  add column if not exists place_kind text;
alter table public.area_photo_posts
  drop constraint if exists area_photo_posts_place_kind_check;
alter table public.area_photo_posts
  add constraint area_photo_posts_place_kind_check
  check (place_kind is null or place_kind in ('listed','spot','free'));
create index if not exists area_photo_posts_place_id_idx on public.area_photo_posts (place_id) where place_id is not null;
create index if not exists area_photo_posts_venue_id_idx on public.area_photo_posts (venue_id) where venue_id is not null;

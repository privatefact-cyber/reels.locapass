-- ロカわん経由の会員登録を正確に数えるため、会員の「登録元」を記録する。2026-11-20。
-- signup_source: 'pet'=ロカわん(/pet)から登録 / 'locapass'=LOCAPASS本体から登録 / null=記録開始前の会員(区別できない)。
-- 解析関数 locapass_pet_analytics に、登録元別の会員数を追加する(既存の項目はそのまま)。
alter table public.locapass_members add column if not exists signup_source text;
alter table public.locapass_members drop constraint if exists locapass_members_signup_source_check;
alter table public.locapass_members add constraint locapass_members_signup_source_check check (signup_source is null or signup_source in ('pet', 'locapass'));

create or replace function public.locapass_pet_analytics(p_since date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with h as (
    select *, regexp_replace(regexp_replace(path, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'gi'), '^/pet/t/[^/]+', '/pet/t/:code') as page
    from public.site_hits
    where site = 'locapass' and day >= p_since
  ),
  pet as (select * from h where path = '/pet' or path like '/pet/%'),
  first_pet as (select day, vid, min(created_at) as at from pet group by day, vid),
  landing as (
    select distinct on (p.day, p.vid) p.page from pet p order by p.day, p.vid, p.created_at
  ),
  sent as (
    select h.* from h join first_pet f on f.day = h.day and f.vid = h.vid
    where h.created_at > f.at and not (h.path = '/pet' or h.path like '/pet/%')
  ),
  since_ts as (select (p_since::timestamp at time zone 'Asia/Tokyo') as ts),
  owners as (select owner_id, min(created_at) as first_pet_at from public.locapass_pets group by owner_id)
  select jsonb_build_object(
    'pv', (select count(*) from pet),
    'uv', (select count(distinct (day, vid)) from pet),
    'daily', coalesce((select jsonb_agg(r order by r.day) from (
      select day, count(*) pv, count(distinct vid) uv from pet group by day) r), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(r) from (
      select page as path, count(*) pv, count(distinct (day, vid)) uv from pet group by page order by 2 desc limit 15) r), '[]'::jsonb),
    'landing', coalesce((select jsonb_agg(r) from (
      select page as path, count(*) uv from landing group by page order by 2 desc limit 10) r), '[]'::jsonb),
    'refs', coalesce((select jsonb_agg(r) from (
      select case when ref_host = '' then '(直接・ブックマーク・アプリ)' else ref_host end as host, count(*) pv
      from pet group by 1 order by 2 desc limit 10) r), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(r) from (
      select device, count(distinct (day, vid)) uv from pet group by device order by 2 desc) r), '[]'::jsonb),
    'prefs', coalesce((select jsonb_agg(r) from (
      select pref_code, count(distinct (day, vid)) uv from pet where country = 'JP' and pref_code <> '' group by pref_code order by 2 desc limit 10) r), '[]'::jsonb),
    'sent', jsonb_build_object(
      'pv', (select count(*) from sent),
      'uv', (select count(distinct (day, vid)) from sent),
      'shop_pv', (select count(*) from sent where path ~ '^/[^/]+/shops/'),
      'shop_uv', (select count(distinct (day, vid)) from sent where path ~ '^/[^/]+/shops/'),
      'photo_pv', (select count(*) from sent where path like '/photo%'),
      'shops', coalesce((select jsonb_agg(r) from (
        select substring(path from '^/[^/]+/shops/[^/]+') as path, count(*) pv from sent where path ~ '^/[^/]+/shops/' group by 1 order by 2 desc limit 10) r), '[]'::jsonb),
      'pages', coalesce((select jsonb_agg(r) from (
        select page as path, count(*) pv from sent group by page order by 2 desc limit 10) r), '[]'::jsonb)
    ),
    'usage', jsonb_build_object(
      'members_via_pet', (select count(*) from public.locapass_members where signup_source = 'pet'),
      'members_via_pet_new', (select count(*) from public.locapass_members, since_ts where signup_source = 'pet' and created_at >= ts),
      'members_via_pet_with_dog', (select count(*) from public.locapass_members m where m.signup_source = 'pet' and exists (select 1 from public.locapass_pets p where p.owner_id = m.id)),
      'members_via_locapass', (select count(*) from public.locapass_members where signup_source = 'locapass'),
      'members_unknown_source', (select count(*) from public.locapass_members where signup_source is null),
      'pets', (select count(*) from public.locapass_pets),
      'pets_new', (select count(*) from public.locapass_pets, since_ts where created_at >= ts),
      'owners', (select count(*) from owners),
      'owners_new', (select count(*) from owners, since_ts where first_pet_at >= ts),
      -- 会員登録から24時間以内に犬を登録した人(ロカわんがきっかけで会員になった目安)
      'owners_joined_via_pet', (select count(*) from owners o join public.locapass_members m on m.id = o.owner_id where o.first_pet_at - m.created_at < interval '24 hours'),
      'multi_pet_owners', (select count(*) from (select owner_id from public.locapass_pets group by owner_id having count(*) > 1) x),
      'documents', (select count(*) from public.locapass_pet_documents),
      'documents_new', (select count(*) from public.locapass_pet_documents, since_ts where created_at >= ts),
      'documents_by_type', coalesce((select jsonb_object_agg(doc_type, n) from (select doc_type, count(*) n from public.locapass_pet_documents group by doc_type) x), '{}'::jsonb),
      'medical', (select count(*) from public.locapass_pet_medical_records),
      'diary', (select count(*) from public.locapass_pet_diary_entries),
      'diary_new', (select count(*) from public.locapass_pet_diary_entries, since_ts where created_at >= ts),
      'gallery', (select count(*) from public.locapass_pet_diary_entries where visibility = 'public' and cardinality(image_paths) > 0 and hidden_at is null),
      'gallery_new', (select count(*) from public.locapass_pet_diary_entries, since_ts where visibility = 'public' and cardinality(image_paths) > 0 and hidden_at is null and created_at >= ts),
      'snap', (select count(*) from public.locapass_pet_diary_entries where snap_post_id is not null),
      'snap_new', (select count(*) from public.locapass_pet_diary_entries, since_ts where snap_post_id is not null and created_at >= ts),
      'likes', (select count(*) from public.locapass_pet_diary_likes),
      'likes_new', (select count(*) from public.locapass_pet_diary_likes, since_ts where created_at >= ts),
      'follows', (select count(*) from public.locapass_pet_follows where status = 'approved'),
      'follows_pending', (select count(*) from public.locapass_pet_follows where status = 'pending'),
      'lost_active', (select count(*) from public.locapass_pet_lost_reports where status = 'active' and hidden_at is null),
      'lost_total', (select count(*) from public.locapass_pet_lost_reports),
      'lost_found', (select count(*) from public.locapass_pet_lost_reports where status = 'found'),
      'found_total', (select count(*) from public.locapass_pet_found_reports),
      'found_guest', (select count(*) from public.locapass_pet_found_reports where reporter_id is null),
      'found_open', (select count(*) from public.locapass_pet_found_reports where status = 'open' and hidden_at is null),
      'walk_area_users', (select count(distinct user_id) from public.locapass_pet_walk_areas),
      'line_linked', (select count(*) from public.locapass_pet_owner_settings where line_user_id is not null),
      'push_owners', (select count(distinct s.user_id) from public.locapass_push_subscriptions s join owners o on o.owner_id = s.user_id),
      'card_public', (select count(*) from public.locapass_pets where card_public)
    ),
    'breeds', coalesce((select jsonb_agg(r) from (
      select coalesce(nullif(trim(breed), ''), '(未入力)') as breed, count(*) n from public.locapass_pets group by 1 order by 2 desc limit 12) r), '[]'::jsonb)
  );
$$;
revoke all on function public.locapass_pet_analytics(date) from public, anon, authenticated;
grant execute on function public.locapass_pet_analytics(date) to service_role;

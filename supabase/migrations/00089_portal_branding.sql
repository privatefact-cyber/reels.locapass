-- ポータル単位のテーマとヒーロー素材。
alter table public.locapass_portals
  add column if not exists accent_color text not null default '#F59E0B',
  add column if not exists background_color text not null default '#050505',
  add column if not exists hero_media_type text not null default 'image',
  add column if not exists hero_media_url text;

alter table public.locapass_portals
  drop constraint if exists locapass_portals_hero_media_type_check;
alter table public.locapass_portals
  add constraint locapass_portals_hero_media_type_check check (hero_media_type in ('image', 'video'));

alter table public.locapass_portals
  drop constraint if exists locapass_portals_accent_color_check;
alter table public.locapass_portals
  add constraint locapass_portals_accent_color_check check (accent_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.locapass_portals
  drop constraint if exists locapass_portals_background_color_check;
alter table public.locapass_portals
  add constraint locapass_portals_background_color_check check (background_color ~ '^#[0-9A-Fa-f]{6}$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('locapass-portal-media', 'locapass-portal-media', true, 52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']::text[])
on conflict (id) do update set public = true, file_size_limit = 52428800,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "portal media public read" on storage.objects for select
  to anon, authenticated using (bucket_id = 'locapass-portal-media');
create policy "portal media upload by portal admin" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'locapass-portal-media'
    and locapass_is_portal_admin(((storage.foldername(name))[1])::bigint));
create policy "portal media update by portal admin" on storage.objects for update
  to authenticated
  using (bucket_id = 'locapass-portal-media'
    and locapass_is_portal_admin(((storage.foldername(name))[1])::bigint))
  with check (bucket_id = 'locapass-portal-media'
    and locapass_is_portal_admin(((storage.foldername(name))[1])::bigint));
create policy "portal media delete by portal admin" on storage.objects for delete
  to authenticated
  using (bucket_id = 'locapass-portal-media'
    and locapass_is_portal_admin(((storage.foldername(name))[1])::bigint));

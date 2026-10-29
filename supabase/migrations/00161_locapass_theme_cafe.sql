-- 配色テーマ「cafe」(地中海カフェ。純白の明るいスキン)を、テーマ名の許可リストに加える。
alter table public.platform_settings drop constraint if exists platform_settings_site_theme_check;
alter table public.platform_settings add constraint platform_settings_site_theme_check
  check (site_theme is null or site_theme = any (array['default','christmas','beauty','nature','cafe']));

alter table public.platform_settings drop constraint if exists platform_settings_locapass_site_theme_check;
alter table public.platform_settings add constraint platform_settings_locapass_site_theme_check
  check (locapass_site_theme is null or locapass_site_theme = any (array['default','christmas','beauty','nature','cafe']));

alter table public.locapass_portals drop constraint if exists locapass_portals_theme_check;
alter table public.locapass_portals add constraint locapass_portals_theme_check
  check (theme is null or theme = any (array['default','christmas','beauty','nature','cafe']));

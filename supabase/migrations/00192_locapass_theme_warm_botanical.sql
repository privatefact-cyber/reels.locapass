-- 配色テーマ「warm」(ウォームトラベル)と「botanical」(ボタニカルジャーナル)を許可リストに加える(CHECK制約と locapass_set_site_theme の両方)。
alter table public.platform_settings drop constraint if exists platform_settings_site_theme_check;
alter table public.platform_settings add constraint platform_settings_site_theme_check
  check (site_theme is null or site_theme = any (array['default','christmas','beauty','nature','cafe','coastal','pure','warm','botanical']));

alter table public.platform_settings drop constraint if exists platform_settings_locapass_site_theme_check;
alter table public.platform_settings add constraint platform_settings_locapass_site_theme_check
  check (locapass_site_theme is null or locapass_site_theme = any (array['default','christmas','beauty','nature','cafe','coastal','pure','warm','botanical']));

alter table public.locapass_portals drop constraint if exists locapass_portals_theme_check;
alter table public.locapass_portals add constraint locapass_portals_theme_check
  check (theme is null or theme = any (array['default','christmas','beauty','nature','cafe','coastal','pure','warm','botanical']));

create or replace function public.locapass_set_site_theme(p_theme text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not locapass_is_super_admin() then
    raise exception 'only locapass super admins can change this setting';
  end if;
  if p_theme is not null and p_theme not in ('default', 'christmas', 'beauty', 'nature', 'cafe', 'coastal', 'pure', 'warm', 'botanical') then
    raise exception 'unknown theme: %', p_theme;
  end if;
  update platform_settings
     set locapass_site_theme = p_theme, updated_at = now()
   where id = true;
end;
$function$;

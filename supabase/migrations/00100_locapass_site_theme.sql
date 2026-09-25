-- locapass のサイト全体の配色テーマ(LUXELAの platform_settings.site_theme とは別に切り替える)。
-- - platform_settings.locapass_site_theme … 'default' / 'christmas' / 'beauty' / 'nature' で固定。
--                                           null は「自動」(日本時間12/1〜12/25は christmas、それ以外は default)。
-- platform_settings の更新ポリシーはLUXELA運営者用なので、locapassのスーパー管理者は下のRPC経由で切り替える。

alter table public.platform_settings
  add column if not exists locapass_site_theme text;

alter table public.platform_settings drop constraint if exists platform_settings_locapass_site_theme_check;
alter table public.platform_settings
  add constraint platform_settings_locapass_site_theme_check
  check (locapass_site_theme is null or locapass_site_theme in ('default', 'christmas', 'beauty', 'nature'));

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
  if p_theme is not null and p_theme not in ('default', 'christmas', 'beauty', 'nature') then
    raise exception 'unknown theme: %', p_theme;
  end if;
  update platform_settings
     set locapass_site_theme = p_theme, updated_at = now()
   where id = true;
end;
$function$;

revoke execute on function public.locapass_set_site_theme(text) from public, anon;
grant execute on function public.locapass_set_site_theme(text) to authenticated;

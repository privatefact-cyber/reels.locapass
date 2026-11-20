-- 店舗ページの広告枠(自社告知・編集枠)を、全体で出すかどうかのスイッチ。2026-11-20。
-- off=出さない(既定) / live=無料掲載の店舗ページに出す。platform_settings はLUXELAと共通なので、locapassのスーパー管理者はRPC経由で切り替える。
alter table public.platform_settings add column if not exists locapass_ad_slot_mode text not null default 'off';
alter table public.platform_settings drop constraint if exists platform_settings_locapass_ad_slot_mode_check;
alter table public.platform_settings add constraint platform_settings_locapass_ad_slot_mode_check check (locapass_ad_slot_mode in ('off', 'live'));

create or replace function public.locapass_set_ad_slot_mode(p_mode text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not locapass_is_super_admin() then
    raise exception 'only locapass super admins can change this setting';
  end if;
  if p_mode not in ('off', 'live') then
    raise exception 'invalid mode';
  end if;
  update platform_settings set locapass_ad_slot_mode = p_mode, updated_at = now() where id = true;
end;
$function$;

revoke execute on function public.locapass_set_ad_slot_mode(text) from public, anon;
grant execute on function public.locapass_set_ad_slot_mode(text) to authenticated;

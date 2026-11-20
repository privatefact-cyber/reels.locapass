-- 収集したYouTube動画を店舗に自動で紐づけて公開するとき、有料プランの店舗(またはオプション契約の店舗)だけに限るかどうかのスイッチ。2026-11-20。
-- false(既定)=無料の店舗にも紐づける / true=有料の店舗だけ(無料の店は紐づけまで行い、公開は見送る)。
-- platform_settings はLUXELAと共通なので、locapassのスーパー管理者はRPC経由で切り替える。
alter table public.platform_settings add column if not exists locapass_auto_link_paid_only boolean not null default false;

create or replace function public.locapass_set_auto_link_paid_only(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not locapass_is_super_admin() then
    raise exception 'only locapass super admins can change this setting';
  end if;
  update platform_settings set locapass_auto_link_paid_only = p_enabled, updated_at = now() where id = true;
end;
$function$;

revoke execute on function public.locapass_set_auto_link_paid_only(boolean) from public, anon;
grant execute on function public.locapass_set_auto_link_paid_only(boolean) to authenticated;

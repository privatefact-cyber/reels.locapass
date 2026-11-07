-- 店舗ダッシュボードの「経由の連絡」カードを、店舗に見せるかどうか(運営専用スイッチ)。
-- 集計(連絡ボタンの押下回数)は常に続け、アクセスが十分に増えるまで店舗側には出さないために使う。初期値は非表示。
-- LUXELAとLOCAPASSはplatform_settingsを共用しているので、列を分ける。
--  - contact_stats_visible … LUXELA(更新はplatform_settingsのRLS=is_platform_adminで制限される)
--  - locapass_contact_stats_visible … LOCAPASS(スーパー管理者は下のRPC経由で切り替える。00099と同じ方式)
alter table public.platform_settings
  add column if not exists contact_stats_visible boolean not null default false,
  add column if not exists locapass_contact_stats_visible boolean not null default false;

create or replace function public.locapass_set_contact_stats_visible(p_visible boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not locapass_is_super_admin() then
    raise exception 'only locapass super admins can change this setting';
  end if;
  update platform_settings
     set locapass_contact_stats_visible = p_visible, updated_at = now()
   where id = true;
end;
$function$;

revoke execute on function public.locapass_set_contact_stats_visible(boolean) from public, anon;
grant execute on function public.locapass_set_contact_stats_visible(boolean) to authenticated;

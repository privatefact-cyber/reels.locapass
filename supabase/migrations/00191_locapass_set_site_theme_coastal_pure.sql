-- locapass_set_site_theme の許可リストに coastal / pure を追加(00190 のCHECK制約だけでは関数側で弾かれていた)。
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
  if p_theme is not null and p_theme not in ('default', 'christmas', 'beauty', 'nature', 'cafe', 'coastal', 'pure') then
    raise exception 'unknown theme: %', p_theme;
  end if;
  update platform_settings
     set locapass_site_theme = p_theme, updated_at = now()
   where id = true;
end;
$function$;

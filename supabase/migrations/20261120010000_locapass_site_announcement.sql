-- トップに出す「サイトのお知らせ」。本文が空(null)なら何も表示しない。
-- platform_settings の更新ポリシーはLUXELA運営者用なので、locapassのスーパー管理者は下のRPC経由で書き換える。
alter table public.platform_settings
  add column if not exists locapass_announcement text,
  add column if not exists locapass_announcement_url text;

create or replace function public.locapass_set_announcement(p_text text, p_url text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t text := nullif(btrim(coalesce(p_text, '')), '');
  u text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if not locapass_is_super_admin() then
    raise exception 'only locapass super admins can change this setting';
  end if;
  if t is not null and char_length(t) > 500 then
    raise exception 'announcement too long';
  end if;
  if u is not null and not (u ~ '^https?://' or u ~ '^/[^/]') then
    raise exception 'invalid url';
  end if;
  update platform_settings
     set locapass_announcement = t,
         locapass_announcement_url = case when t is null then null else u end,
         updated_at = now()
   where id = true;
end;
$function$;

revoke execute on function public.locapass_set_announcement(text, text) from public, anon;
grant execute on function public.locapass_set_announcement(text, text) to authenticated;

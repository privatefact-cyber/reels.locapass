-- 店舗オプション「外部動画の追加」(YouTubeショート / TikTok / Instagramリールを、リール・イベントとして追加)。既定はオフ。
-- 契約(オン/オフ)はプランと同じく portal_admin 以上だけが変更できる(店舗は変更不可)。
alter table public.locapass_shops add column if not exists embed_enabled boolean not null default false;

create or replace function public.locapass_shops_guard_privileged()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null
     and (new.plan is distinct from old.plan
          or new.status is distinct from old.status
          or new.portal_id is distinct from old.portal_id
          or new.map_video_enabled is distinct from old.map_video_enabled
          or new.embed_enabled is distinct from old.embed_enabled
          or new.sns_whisper is distinct from old.sns_whisper
          or new.sns_whisper_updated_at is distinct from old.sns_whisper_updated_at
          or new.sns_whisper_source is distinct from old.sns_whisper_source
          or new.sns_whisper_checked_at is distinct from old.sns_whisper_checked_at
          or new.sns_whisper_sources is distinct from old.sns_whisper_sources
          or new.is_temporarily_closed is distinct from old.is_temporarily_closed)
     and not locapass_is_portal_admin(old.portal_id) then
    raise exception 'plan/status/portal_id/map_video_enabled/embed_enabled/sns_whisper/is_temporarily_closed can only be changed by portal admins';
  end if;
  if new.portal_id is distinct from old.portal_id and auth.uid() is not null and not locapass_is_portal_admin(new.portal_id) then
    raise exception 'not an admin of the destination portal';
  end if;
  return new;
end;
$function$;

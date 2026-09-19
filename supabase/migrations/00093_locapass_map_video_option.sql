-- マップのカード動画(本家 shops.map_video_enabled / map_preview_reel_id / reels.preview_url と同じ仕組み)。
--   map_video_enabled   : 動画オプションの契約。プランと同じく portal_admin 以上だけが変更できる(店舗は変更不可)。
--   map_preview_reel_id : カードで流すリール。店舗が選ぶ。自店舗の公開中の動画リールだけ選べる。
--   locapass_reels.preview_url : カード用の軽量プレビュー動画(投稿時にブラウザで作る)。
alter table public.locapass_shops
  add column if not exists map_video_enabled boolean not null default false,
  add column if not exists map_preview_reel_id uuid references public.locapass_reels(id) on delete set null;
alter table public.locapass_reels add column if not exists preview_url text;

create or replace function public.locapass_shops_guard_privileged()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.plan is distinct from old.plan
          or new.status is distinct from old.status
          or new.portal_id is distinct from old.portal_id
          or new.map_video_enabled is distinct from old.map_video_enabled)
     and not locapass_is_portal_admin(old.portal_id) then
    raise exception 'plan/status/portal_id/map_video_enabled can only be changed by portal admins';
  end if;
  if new.portal_id is distinct from old.portal_id and auth.uid() is not null and not locapass_is_portal_admin(new.portal_id) then
    raise exception 'not an admin of the destination portal';
  end if;
  return new;
end;
$$;

create or replace function public.locapass_validate_shop_map_preview_reel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.map_preview_reel_id is not null
     and (tg_op = 'INSERT' or new.map_preview_reel_id is distinct from old.map_preview_reel_id) then
    if not exists (
      select 1 from public.locapass_reels r
      where r.id = new.map_preview_reel_id
        and r.shop_id = new.id
        and r.status = 'publish'
        and r.reel_type = 'permanent'
        and r.video_url is not null
    ) then
      raise exception 'map preview reel must be a published video reel of this shop';
    end if;
  end if;
  return new;
end;
$$;
create trigger locapass_shops_validate_map_preview_reel before insert or update of map_preview_reel_id on public.locapass_shops
  for each row execute function public.locapass_validate_shop_map_preview_reel();

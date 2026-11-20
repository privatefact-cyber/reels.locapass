-- ADオプション: 通常版以上の店舗が、自分の広告カードを同じポータルの無料掲載の店舗ページに出せる。2026-11-21。
-- 契約(オン/オフ)は他のオプションと同じく portal_admin 以上だけが変更できる(店舗は変更不可)。
alter table public.locapass_shops add column if not exists ad_option_enabled boolean not null default false;

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
          or new.auto_video_enabled is distinct from old.auto_video_enabled
          or new.ai_chat_enabled is distinct from old.ai_chat_enabled
          or new.ad_option_enabled is distinct from old.ad_option_enabled
          or new.sns_whisper is distinct from old.sns_whisper
          or new.sns_whisper_updated_at is distinct from old.sns_whisper_updated_at
          or new.sns_whisper_source is distinct from old.sns_whisper_source
          or new.sns_whisper_checked_at is distinct from old.sns_whisper_checked_at
          or new.sns_whisper_sources is distinct from old.sns_whisper_sources
          or new.is_temporarily_closed is distinct from old.is_temporarily_closed)
     and not locapass_is_portal_admin(old.portal_id) then
    raise exception 'plan/status/portal_id/map_video_enabled/embed_enabled/auto_video_enabled/ai_chat_enabled/ad_option_enabled/sns_whisper/is_temporarily_closed can only be changed by portal admins';
  end if;
  if new.portal_id is distinct from old.portal_id and auth.uid() is not null and not locapass_is_portal_admin(new.portal_id) then
    raise exception 'not an admin of the destination portal';
  end if;
  return new;
end;
$function$;

-- 広告カードに「どの店舗のカードか」「承認の状態」を足す。shop_id が空のカードは運営のカード(承認済みとして扱う)。
alter table public.locapass_ad_cards add column if not exists shop_id uuid references public.locapass_shops (id) on delete cascade;
alter table public.locapass_ad_cards add column if not exists status text not null default 'approved';
alter table public.locapass_ad_cards drop constraint if exists locapass_ad_cards_status_check;
alter table public.locapass_ad_cards add constraint locapass_ad_cards_status_check check (status in ('pending', 'approved', 'rejected'));
alter table public.locapass_ad_cards add column if not exists reject_reason text;
-- true なら、出す先を「同じ業種(category)の無料店ページ」だけに絞る。false なら同じポータルの無料店ページ全部。
alter table public.locapass_ad_cards add column if not exists same_category_only boolean not null default false;
create index if not exists locapass_ad_cards_shop_idx on public.locapass_ad_cards (shop_id);

drop policy if exists "read active ad cards" on public.locapass_ad_cards;
create policy "read active ad cards" on public.locapass_ad_cards for select to anon, authenticated using (is_active and status = 'approved');

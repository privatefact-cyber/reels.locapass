-- 「街の声ベータ版」をlocapassにも入れる(LUXELAの 00094〜00096 と同じ仕組み。DBは共通なので
-- テーブル・列はlocapass専用のものを別に持つ)。
--
-- - locapass_shops.sns_whisper など … 自動収集(scripts/sync-street-whispers.ts)が客向けにポジティブだけ
--   蒸留した噂ネタ。コンシェルジュの「街の声 β」タブでAIが提案の中に織り込む。
-- - locapass_shops.is_temporarily_closed … 「営業停止中・閉店」の疑いの内部フラグ。公開ページからの自動非表示はしない。
-- - locapass_shop_street_investigations … 収集した生データ(ネガティブ含む全部)の履歴。ポータル管理者以上のみ閲覧可。
-- - platform_settings.locapass_machi_no_koe_beta_enabled … locapassの街の声タブの表示可否(LUXELAとは別に切り替える)。

alter table public.locapass_shops add column if not exists sns_whisper text;
alter table public.locapass_shops add column if not exists sns_whisper_updated_at timestamptz;
alter table public.locapass_shops add column if not exists sns_whisper_source text;
alter table public.locapass_shops add column if not exists sns_whisper_checked_at timestamptz;
alter table public.locapass_shops add column if not exists sns_whisper_sources jsonb;
alter table public.locapass_shops add column if not exists is_temporarily_closed boolean not null default false;

alter table public.locapass_shops drop constraint if exists locapass_shops_sns_whisper_length;
alter table public.locapass_shops
  add constraint locapass_shops_sns_whisper_length check (sns_whisper is null or char_length(sns_whisper) <= 200);
alter table public.locapass_shops drop constraint if exists locapass_shops_sns_whisper_source_check;
alter table public.locapass_shops
  add constraint locapass_shops_sns_whisper_source_check
  check (sns_whisper_source is null or sns_whisper_source in ('manual', 'auto'));

-- 空文字を NULL に揃え、内容が変わったときだけ更新日時を打つ(LUXELAの touch_shop_sns_whisper を共用)。
drop trigger if exists locapass_shops_touch_sns_whisper on public.locapass_shops;
create trigger locapass_shops_touch_sns_whisper
  before update of sns_whisper on public.locapass_shops
  for each row execute function public.touch_shop_sns_whisper();

-- 噂ネタ・営業停止フラグは店舗管理者(shop_admin)には触らせない(自店の噂を書き換えられるとステマになる)。
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
          or new.sns_whisper is distinct from old.sns_whisper
          or new.sns_whisper_updated_at is distinct from old.sns_whisper_updated_at
          or new.sns_whisper_source is distinct from old.sns_whisper_source
          or new.sns_whisper_checked_at is distinct from old.sns_whisper_checked_at
          or new.sns_whisper_sources is distinct from old.sns_whisper_sources
          or new.is_temporarily_closed is distinct from old.is_temporarily_closed)
     and not locapass_is_portal_admin(old.portal_id) then
    raise exception 'plan/status/portal_id/map_video_enabled/sns_whisper/is_temporarily_closed can only be changed by portal admins';
  end if;
  if new.portal_id is distinct from old.portal_id and auth.uid() is not null and not locapass_is_portal_admin(new.portal_id) then
    raise exception 'not an admin of the destination portal';
  end if;
  return new;
end;
$function$;

create table if not exists public.locapass_shop_street_investigations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  created_at timestamptz not null default now(),
  model text,
  search_queries text[] not null default '{}',
  sources jsonb not null default '[]'::jsonb,
  raw_text text,
  llm_result jsonb,
  is_closed boolean,
  whisper_text text,
  summary_reason text
);

create index if not exists locapass_shop_street_investigations_shop_created_idx
  on public.locapass_shop_street_investigations (shop_id, created_at desc);

alter table public.locapass_shop_street_investigations enable row level security;

-- ポータル管理者以上だけ(ネガティブ情報・事件報道を含むため、店舗管理者・一般には見せない)。
-- 書き込みは収集スクリプトがサービスロールで行うので、insertポリシーは作らない。
create policy "portal admin read street investigations"
  on public.locapass_shop_street_investigations for select
  to authenticated
  using (exists (
    select 1 from public.locapass_shops s
    where s.id = shop_id and public.locapass_is_portal_admin(s.portal_id)
  ));

revoke all on table public.locapass_shop_street_investigations from anon;

alter table public.platform_settings
  add column if not exists locapass_machi_no_koe_beta_enabled boolean not null default false;

-- platform_settings の更新ポリシーはLUXELA運営者(is_platform_admin)用なので、
-- locapassのスーパー管理者はこのRPC経由でlocapass用の列だけ切り替える。
create or replace function public.locapass_set_machi_no_koe_beta(p_enabled boolean)
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
     set locapass_machi_no_koe_beta_enabled = p_enabled, updated_at = now()
   where id = true;
end;
$function$;

revoke execute on function public.locapass_set_machi_no_koe_beta(boolean) from public, anon;
grant execute on function public.locapass_set_machi_no_koe_beta(boolean) to authenticated;

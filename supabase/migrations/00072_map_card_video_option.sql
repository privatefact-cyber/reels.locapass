-- マップのカードに動画を流すのを「動画オプション」契約店舗だけにする。
-- 通常のカードはトップヒーロー画像(無ければLOCAPASSの黒背景)で、動画の転送量をかけない。
--
-- - shops.map_video_enabled   … 動画オプション。運営者だけが切り替えられる(プランとは別)。
-- - shops.map_preview_reel_id … 店舗が選んだカード用の動画リール。未選択なら最新の動画リール。
-- - reels.preview_url         … カード用の軽量プレビュー(6秒・長辺480px・無音)。投稿時に作る。
--                                無い古い投稿は元動画で代用する。

alter table public.reels add column if not exists preview_url text;

alter table public.shops add column if not exists map_video_enabled boolean not null default false;
alter table public.shops add column if not exists map_preview_reel_id uuid references public.reels(id) on delete set null;

create index if not exists reels_shop_published_reel_idx
  on public.reels (shop_id, created_at desc)
  where status = 'published' and post_type = 'reel';

-- 「authenticated update own shop」ポリシーは自店舗の全列を更新できてしまうため、
-- 課金・掲載順位に関わる列は運営者(またはservice role/DB直)以外が変更できないようにする。
create or replace function public.guard_shop_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (new.plan is distinct from old.plan
      or new.map_video_enabled is distinct from old.map_video_enabled
      or new.is_sponsored is distinct from old.is_sponsored
      or new.sponsored_rank is distinct from old.sponsored_rank
      or new.is_verified is distinct from old.is_verified)
     and coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not public.is_platform_admin() then
    raise exception 'plan / map_video_enabled / sponsored / verified can only be changed by the platform admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shops_guard_privileged_columns on public.shops;
create trigger trg_shops_guard_privileged_columns
  before update on public.shops
  for each row execute function public.guard_shop_privileged_columns();

-- カード用に選べるのは、その店舗の公開中の動画リールだけ。
create or replace function public.validate_shop_map_preview_reel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.map_preview_reel_id is not null
     and (tg_op = 'INSERT' or new.map_preview_reel_id is distinct from old.map_preview_reel_id) then
    if not exists (
      select 1 from public.reels r
      where r.id = new.map_preview_reel_id
        and r.shop_id = new.id
        and r.status = 'published'
        and r.post_type = 'reel'
        and jsonb_typeof(r.media) = 'array'
        and exists (select 1 from jsonb_array_elements(r.media) e where e->>'type' = 'video')
    ) then
      raise exception 'map preview reel must be a published video reel of this shop';
    end if;
  end if;
  return new;
end;
$$;

-- トリガー専用の関数なので、/rest/v1/rpc から直接呼べないようにする
-- (トリガーの発火には呼び出し側のEXECUTE権限は不要)。
revoke execute on function public.validate_shop_map_preview_reel() from public, anon, authenticated;
revoke execute on function public.guard_shop_privileged_columns() from public, anon, authenticated;

drop trigger if exists trg_shops_validate_map_preview_reel on public.shops;
create trigger trg_shops_validate_map_preview_reel
  before insert or update of map_preview_reel_id on public.shops
  for each row execute function public.validate_shop_map_preview_reel();

-- マップのカード用に「店舗ごとのリール件数」と「最新の動画1本」だけを返す。
-- 以前は表示範囲の店舗の全リールをアプリに転送して数えていたため、投稿が増えるほど重くなっていた。
-- ストーリー(フォロワー限定)は含めない。
create or replace function public.venue_card_reels(p_shop_ids uuid[])
returns table (shop_id uuid, reel_count integer, latest_video_url text, latest_preview_url text)
language sql
stable
security invoker
set search_path = public
as $$
  with published as (
    select
      r.shop_id,
      r.created_at,
      r.preview_url,
      case when jsonb_typeof(r.media) = 'array' then
        (select e->>'url' from jsonb_array_elements(r.media) e where e->>'type' = 'video' limit 1)
      end as video_url
    from public.reels r
    where r.shop_id = any(p_shop_ids)
      and r.status = 'published'
      and r.post_type = 'reel'
  ),
  counts as (
    select p.shop_id, count(*)::integer as reel_count from published p group by p.shop_id
  ),
  latest as (
    select distinct on (p.shop_id) p.shop_id, p.video_url, p.preview_url
    from published p
    where p.video_url is not null
    order by p.shop_id, p.created_at desc
  )
  select c.shop_id, c.reel_count, l.video_url, l.preview_url
  from counts c
  left join latest l on l.shop_id = c.shop_id;
$$;

grant execute on function public.venue_card_reels(uuid[]) to anon, authenticated;

-- 無料プランの動画の保存方針: 店が上げた最新の動画1本は残し、それより古い動画は一定日数(既定30日)で削除する。
-- (動画を全部消すと店のページが真っ黒になるため、最新の1本は必ず残す。規約に明記する前提)
--
-- 20261108120000 の掃除判定(書庫の人気のないリール)を、この方針に置き換える。
-- 有料プランの店のリールは自動削除しない。人気は問わない。公開中の古い動画も対象。
-- 「公開中の、より新しい動画が別にある」場合だけ消すので、公開中の動画が1本も無い店は何も消えない。

drop function if exists public.locapass_cleanup_reel_candidates(integer, text[], integer, integer);

create or replace function public.locapass_cleanup_reel_candidates(
  p_days integer,
  p_plans text[],
  p_limit integer
)
returns table (reel_id uuid, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, 'free_plan_old_video'::text
  from public.locapass_reels r
  join public.locapass_shops s on s.id = r.shop_id
  where p_days is not null
    and s.plan = any (p_plans)
    and r.reel_type = 'permanent'
    and r.video_url like '%media.locapass.net%'
    and r.embed_provider is null
    and r.is_placeholder = false
    and coalesce(r.published_at, r.wp_created_at, r.updated_at) < now() - make_interval(days => p_days)
    and exists (
      select 1
      from public.locapass_reels n
      where n.shop_id = r.shop_id
        and n.id <> r.id
        and n.reel_type = 'permanent'
        and n.status = 'publish'
        and n.is_placeholder = false
        and n.embed_provider is null
        and n.video_url like '%media.locapass.net%'
        and coalesce(n.published_at, n.wp_created_at, n.updated_at) > coalesce(r.published_at, r.wp_created_at, r.updated_at)
    )
  limit p_limit;
$$;

revoke all on function public.locapass_cleanup_reel_candidates(integer, text[], integer) from public, anon, authenticated;
grant execute on function public.locapass_cleanup_reel_candidates(integer, text[], integer) to service_role;

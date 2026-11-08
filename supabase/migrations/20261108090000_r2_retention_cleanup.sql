-- R2(動画ファイル)の掃除用の下準備(locapass側)。
--
-- 方針: リールは本人の資産なので「古いから消す」はしない。消すのは次の3種類だけ。
--   1) どこからも参照されていない孤児ファイル(投稿の取り消し・審査却下で行が作られなかった動画・削除の残骸)
--   2) 退会(deleted_at)から一定期間が過ぎたキャストのリール
--   3) (任意・環境変数で有効化)長期間、閲覧・いいね・コメント・お気に入りが一切ないリール
-- 実際の削除は app/api/cron/storage-cleanup が行う。この中身は判定だけで、データは消さない。
-- (LUXELA側と同じ storage_cleanup_state を共有する。どちらの移行が先でも動くよう if not exists にしている)

create table if not exists public.storage_cleanup_state (
  key text primary key,
  cursor text,
  updated_at timestamptz not null default now()
);
alter table public.storage_cleanup_state enable row level security;
-- ポリシーは作らない(= service_role だけが読み書きできる)

create index if not exists idx_locapass_reels_images_gin on public.locapass_reels using gin (images jsonb_path_ops);
create index if not exists idx_locapass_reels_video_url on public.locapass_reels (video_url) where video_url is not null;
create index if not exists idx_locapass_reels_poster_url on public.locapass_reels (poster_url) where poster_url is not null;
create index if not exists idx_locapass_reels_preview_url on public.locapass_reels (preview_url) where preview_url is not null;
create index if not exists idx_area_photo_posts_video_url on public.area_photo_posts (video_url) where video_url is not null;

-- 渡されたR2のキーのうち、どこからも参照されていないものだけを返す。
-- 参照元: リール(動画・ポスター・プレビュー・画像)、エリアフォト投稿の動画、広告、ポータル/店舗の見た目。
create or replace function public.locapass_unreferenced_r2_keys(p_keys text[], p_base text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(k), '{}'::text[])
  from unnest(p_keys) as k
  where not exists (
          select 1 from public.locapass_reels r
          where r.video_url = p_base || '/' || k
             or r.poster_url = p_base || '/' || k
             or r.preview_url = p_base || '/' || k
             or r.images @> jsonb_build_array(jsonb_build_object('url', p_base || '/' || k))
        )
    and not exists (select 1 from public.area_photo_posts a where a.video_url = p_base || '/' || k or a.image_url = p_base || '/' || k)
    and not exists (select 1 from public.locapass_ads d where d.media_url = p_base || '/' || k or d.poster_url = p_base || '/' || k)
    and not exists (select 1 from public.locapass_portals p where p.hero_media_url = p_base || '/' || k or p.cover_image_url = p_base || '/' || k)
    and not exists (
          select 1 from public.locapass_shops s
          where s.hero_media_url = p_base || '/' || k or s.cover_url = p_base || '/' || k or s.icon_url = p_base || '/' || k
        );
$$;

-- 削除してよいリールの候補を返す(消さない)。
--  cast_withdrawn : 退会して p_deleted_cast_days 日が過ぎたキャストのリール(退会取り消しの猶予を過ぎたもの)
--  zero_engagement: 公開から p_zero_view_days 日が過ぎ、閲覧・いいね・コメント・お気に入りが一切なく、
--                   ピン留め・マップ動画にも使われていない、R2に動画があるリール(null なら対象外)
create or replace function public.locapass_cleanup_reel_candidates(
  p_deleted_cast_days integer,
  p_zero_view_days integer,
  p_limit integer
)
returns table (reel_id uuid, reason text)
language sql
stable
security definer
set search_path = public
as $$
  (
    select r.id, 'cast_withdrawn'::text
    from public.locapass_reels r
    join public.locapass_cast_members c on c.id = r.cast_id
    where p_deleted_cast_days is not null
      and c.deleted_at is not null
      and c.deleted_at < now() - make_interval(days => p_deleted_cast_days)
    limit p_limit
  )
  union all
  (
    select r.id, 'zero_engagement'::text
    from public.locapass_reels r
    where p_zero_view_days is not null
      and r.reel_type = 'permanent'
      and r.status = 'publish'
      and coalesce(r.published_at, r.wp_created_at, r.updated_at) < now() - make_interval(days => p_zero_view_days)
      and r.embed_provider is null
      and r.is_placeholder = false
      and r.video_url like '%media.locapass.net%'
      and r.like_count = 0
      and r.pinned_at is null
      and r.shop_pinned_at is null
      and not exists (select 1 from public.locapass_reel_events e where e.reel_id = r.id)
      and not exists (select 1 from public.locapass_reel_likes l where l.reel_id = r.id)
      and not exists (select 1 from public.locapass_reel_comments cm where cm.reel_id = r.id and cm.is_deleted = false)
      and not exists (select 1 from public.locapass_member_favorite_reels f where f.reel_id = r.id)
      and not exists (select 1 from public.locapass_shops s where s.map_preview_reel_id = r.id)
    limit p_limit
  );
$$;

revoke all on function public.locapass_unreferenced_r2_keys(text[], text) from public, anon, authenticated;
revoke all on function public.locapass_cleanup_reel_candidates(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.locapass_unreferenced_r2_keys(text[], text) to service_role;
grant execute on function public.locapass_cleanup_reel_candidates(integer, integer, integer) to service_role;

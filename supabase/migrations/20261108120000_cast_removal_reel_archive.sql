-- パートナー(FACES)を店が削除(退店)するときの、リールの扱い(LUXELA側 00146 と同じ考え方)。
--
-- リールの持ち主は店舗(キャスト個人ではない)。プラットフォームは「その動画を使うか」を判断しない。
-- 削除時に、店が次のどちらかを選ぶ。
--   archive: リールは非表示(draft)にして店の「書庫」に残す(既定)。店は、再表示も削除も自由にできる。
--   delete : リールも削除する。
-- どちらでも本人のログインは即停止し、30日以内なら復帰できる(従来どおり)。
-- 復帰すると、退店で書庫に入ったリールは公開に戻る(店が個別に操作したものは除く)。
--
-- あわせて、掃除の判定を見直す: 「退会キャストのリールを消す」をやめ、
-- 「安いプランの店の、書庫に一定期間置かれた、人気のないリールを消す」に変える(規約に明記する前提)。

alter table public.locapass_reels
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text check (hidden_reason in ('cast_removed', 'manual'));

create index if not exists idx_locapass_reels_shop_archive
  on public.locapass_reels (shop_id, hidden_at desc)
  where hidden_reason is not null;

drop function if exists public.locapass_soft_delete_cast_member(uuid);

create or replace function public.locapass_soft_delete_cast_member(p_cast_id uuid, p_reels text default 'archive')
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
begin
  if p_reels not in ('archive', 'delete') then
    raise exception 'invalid reels option';
  end if;

  select shop_id, user_id into v_shop_id, v_user_id from public.locapass_cast_members where id = p_cast_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if not public.locapass_is_shop_admin(v_shop_id) then
    raise exception 'not authorized';
  end if;

  update public.locapass_cast_members set deleted_at = now() where id = p_cast_id;
  if v_user_id is not null then
    update auth.users set banned_until = 'infinity' where id = v_user_id;
  end if;

  if p_reels = 'delete' then
    -- 行を消す。R2のファイルは、後日の掃除(孤児ファイル)が猶予のあとに消す。
    update public.locapass_shops set map_preview_reel_id = null
      where map_preview_reel_id in (select id from public.locapass_reels where cast_id = p_cast_id);
    delete from public.locapass_reels where cast_id = p_cast_id;
  else
    -- 公開中のリールを非表示(draft)にして、店の書庫に残す。
    update public.locapass_shops set map_preview_reel_id = null
      where map_preview_reel_id in (select id from public.locapass_reels where cast_id = p_cast_id and status = 'publish');
    update public.locapass_reels
      set status = 'draft', hidden_at = now(), hidden_reason = 'cast_removed'
      where cast_id = p_cast_id and status = 'publish';
  end if;
end;
$$;

revoke all on function public.locapass_soft_delete_cast_member(uuid, text) from public, anon;
grant execute on function public.locapass_soft_delete_cast_member(uuid, text) to authenticated;

create or replace function public.locapass_restore_cast_member(p_cast_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
  v_deleted_at timestamptz;
begin
  select shop_id, user_id, deleted_at into v_shop_id, v_user_id, v_deleted_at
  from public.locapass_cast_members where id = p_cast_id;
  if v_shop_id is null then
    raise exception 'not found';
  end if;
  if not public.locapass_is_shop_admin(v_shop_id) then
    raise exception 'not authorized';
  end if;
  if v_deleted_at is null then
    raise exception 'not deleted';
  end if;
  if v_deleted_at < now() - interval '30 days' then
    raise exception 'restore window expired';
  end if;

  update public.locapass_cast_members set deleted_at = null where id = p_cast_id;
  if v_user_id is not null then
    update auth.users set banned_until = null where id = v_user_id;
  end if;

  -- 退店で書庫に入ったリールを、公開に戻す(店が個別に非表示にしたものは戻さない)。
  update public.locapass_reels
    set status = 'publish', hidden_at = null, hidden_reason = null
    where cast_id = p_cast_id and status = 'draft' and hidden_reason = 'cast_removed';
end;
$$;

revoke all on function public.locapass_restore_cast_member(uuid) from public, anon;
grant execute on function public.locapass_restore_cast_member(uuid) to authenticated;

-- 掃除の削除候補(消さない)。旧版(退会キャスト・反応ゼロ)は廃止して作り直す。
--  hidden_stock_expired: 書庫(非表示)に p_hidden_days 日以上置かれ、安いプラン(p_plans)の店で、
--                        人気のない(いいね0・コメント/お気に入りなし・閲覧が p_max_views 以下)、R2に動画があるリール。
--                        p_hidden_days が null なら対象外。
drop function if exists public.locapass_cleanup_reel_candidates(integer, integer, integer);

create or replace function public.locapass_cleanup_reel_candidates(
  p_hidden_days integer,
  p_plans text[],
  p_max_views integer,
  p_limit integer
)
returns table (reel_id uuid, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, 'hidden_stock_expired'::text
  from public.locapass_reels r
  join public.locapass_shops s on s.id = r.shop_id
  where p_hidden_days is not null
    and r.status = 'draft'
    and r.hidden_reason is not null
    and r.hidden_at < now() - make_interval(days => p_hidden_days)
    and s.plan = any (p_plans)
    and r.embed_provider is null
    and r.is_placeholder = false
    and r.video_url like '%media.locapass.net%'
    and r.like_count = 0
    and r.pinned_at is null
    and r.shop_pinned_at is null
    and not exists (select 1 from public.locapass_reel_likes l where l.reel_id = r.id)
    and not exists (select 1 from public.locapass_reel_comments cm where cm.reel_id = r.id and cm.is_deleted = false)
    and not exists (select 1 from public.locapass_member_favorite_reels f where f.reel_id = r.id)
    and (select count(*) from public.locapass_reel_events e where e.reel_id = r.id and e.event_type = 'view') <= p_max_views
    and not exists (select 1 from public.locapass_shops ms where ms.map_preview_reel_id = r.id)
  limit p_limit;
$$;

revoke all on function public.locapass_cleanup_reel_candidates(integer, text[], integer, integer) from public, anon, authenticated;
grant execute on function public.locapass_cleanup_reel_candidates(integer, text[], integer, integer) to service_role;

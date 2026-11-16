-- リール文章検索の足切りを調整。
-- 意味の近さ(sim)は、関係ない質問でも0.55〜0.62くらいは出る。点数だけで切ると、飲食店の動画ばかりの店で
-- 「イタリアン」と探したときに全部が出てしまう。そこで、
--   ・言葉が含まれる動画(kw)は必ず出す
--   ・意味だけで拾うのは「p_min_sim 以上」かつ「いちばん近い動画との差が p_band 以内」のものだけ
-- にする(いちばん近い動画自体が p_min_sim に届かなければ、何も出さない)。
drop function if exists public.locapass_search_reels(uuid[], extensions.vector, text[], real, int);

create or replace function public.locapass_search_reels(
  p_ids uuid[],
  p_embedding extensions.vector(768),
  p_terms text[],
  p_min_sim real default 0.66,
  p_limit int default 500,
  p_band real default 0.05
)
returns table (reel_id uuid, sim real, kw boolean)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with scored as (
    select
      s.reel_id,
      case when s.embedding is null or p_embedding is null then 0 else (1 - (s.embedding <=> p_embedding))::real end as sim,
      exists (
        select 1 from unnest(coalesce(p_terms, '{}'::text[])) t
        where t <> '' and (s.search_text ilike '%' || t || '%' or coalesce(r.caption, '') ilike '%' || t || '%')
      ) as kw
    from public.locapass_reel_search s
    join public.locapass_reels r on r.id = s.reel_id
    where s.reel_id = any(p_ids)
  ),
  top as (select coalesce(max(sim), 0) as best from scored)
  select x.reel_id, x.sim, x.kw
  from scored x, top
  where x.kw or (x.sim >= p_min_sim and x.sim >= top.best - p_band)
  order by x.kw desc, x.sim desc
  limit p_limit
$$;

grant execute on function public.locapass_search_reels(uuid[], extensions.vector, text[], real, int, real) to anon, authenticated;

-- リールの「文章で探せる検索」用データ。
--   search_text : AIが作った検索用の文(見えているもの・場面のキーワード+一言の要約+キャプションの先頭)。文字検索の対象。
--   embedding   : search_text の意味ベクトル(768次元)。「猫」「ねこ」「看板猫」「cat」のような言い換えを同じ結果にする。
-- 書き込みはサーバー(service role)だけ。読み取りは、そのリールを読める人だけ(リールのRLSをそのまま借りる)。
-- 検索の関数は security invoker なので、公開リールは誰でも・下書きは持ち主だけ、という既存の見え方が崩れない。

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.locapass_reel_search (
  reel_id uuid primary key references public.locapass_reels(id) on delete cascade,
  shop_id uuid,
  search_text text not null default '',
  embedding extensions.vector(768),
  updated_at timestamptz not null default now()
);
alter table public.locapass_reel_search enable row level security;

-- 公開ページ用の読み取りは anon と authenticated の両方に与える(CLAUDE.md の注意)。
-- 「リール本体が読める」ことだけを条件にする(exists内のリールにはリール側のRLSが効く)。
drop policy if exists "read search rows of visible reels" on public.locapass_reel_search;
create policy "read search rows of visible reels" on public.locapass_reel_search
  for select to anon, authenticated
  using (exists (select 1 from public.locapass_reels r where r.id = locapass_reel_search.reel_id));

create index if not exists locapass_reel_search_shop_idx on public.locapass_reel_search (shop_id);
create index if not exists locapass_reel_search_trgm on public.locapass_reel_search using gin (search_text extensions.gin_trgm_ops);
create index if not exists locapass_reel_search_embedding_idx on public.locapass_reel_search using hnsw (embedding extensions.vector_cosine_ops);

-- 検索。p_ids = 画面に出ている動画のID(その範囲の中でだけ探す)。
--   kw : 言葉がそのまま含まれている(キーワードが search_text かキャプションに入っている)
--   sim: 質問文との意味の近さ(0〜1)
-- 戻りは「言葉が含まれる or 近さが p_min_sim 以上」のものだけ。言葉が含まれるものを先に、近い順。
create or replace function public.locapass_search_reels(
  p_ids uuid[],
  p_embedding extensions.vector(768),
  p_terms text[],
  p_min_sim real default 0.6,
  p_limit int default 500
)
returns table (reel_id uuid, sim real, kw boolean)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select x.reel_id, x.sim, x.kw
  from (
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
  ) x
  where x.kw or x.sim >= p_min_sim
  order by x.kw desc, x.sim desc
  limit p_limit
$$;

grant execute on function public.locapass_search_reels(uuid[], extensions.vector, text[], real, int) to anon, authenticated;

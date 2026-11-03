-- コンシェルジュAI(wp-inquiry-chat)の「質問に合う店舗だけを探してAIに渡す」ための検索用データ。
-- 店舗数が増えても、AIに渡す資料の量(=返信の速さ・費用)を一定にするのが目的。
--  scope_key: 'locapass'(locapass_shops。全ポータル横断) / 'kb:<site_id>'(kb_documents。luxela.jp等)
--  embedding: 店舗紹介の意味ベクトル(768次元)。「静かに話せる」のような曖昧な質問を拾う。
--  fresh / paid: 更新の新しさ(0〜1)と有料店(0/1)。並び順の重みは concierge_settings で後から変えられる。
-- アプリ(anon/authenticated)からは見えない(RLSを有効にして、ポリシーは作らない)。edge function(service role)だけが使う。

create extension if not exists vector with schema extensions;

create table if not exists wp_inquiry.shop_index (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null,
  shop_id uuid not null,
  portal_id bigint,
  genre text,
  area text,
  title text not null,
  url text not null,
  search_text text not null default '',
  content_hash text not null default '',
  embedding extensions.vector(768),
  fresh real not null default 0,
  paid real not null default 0,
  indexed_at timestamptz not null default now(),
  unique (scope_key, shop_id)
);
alter table wp_inquiry.shop_index enable row level security;

create index if not exists shop_index_scope_idx on wp_inquiry.shop_index (scope_key, portal_id);
create index if not exists shop_index_search_trgm on wp_inquiry.shop_index using gin (search_text extensions.gin_trgm_ops);
create index if not exists shop_index_embedding_idx on wp_inquiry.shop_index using hnsw (embedding extensions.vector_cosine_ops);

-- 並び順の重み。1行だけ。後から画面やSQLで変えるだけで、デプロイ不要で効く。
create table if not exists wp_inquiry.concierge_settings (
  id boolean primary key default true check (id),
  w_sem real not null default 1.0,        -- 質問との意味の近さ
  w_kw real not null default 0.35,        -- 店名・ジャンル・住所などへのキーワード一致
  w_fresh real not null default 0.15,     -- 最近更新・投稿している店を優先する強さ
  w_paid real not null default 0.15,      -- 有料店を優先する強さ(将来用。いまは有料店がほぼ無いので影響は小さい)
  fresh_halflife_days real not null default 45,
  prompt_limit int not null default 40,   -- AIに渡す店舗数の上限
  small_site_limit int not null default 80 -- これ以下の店舗数のサイトは、従来どおり全店を渡す
);
insert into wp_inquiry.concierge_settings (id) values (true) on conflict (id) do nothing;
alter table wp_inquiry.concierge_settings enable row level security;

-- 質問ベクトル + キーワードで探す。意味の近さ・キーワード一致・新しさ・有料を合わせたスコア順。
create or replace function wp_inquiry.search_shop_index(
  p_scope text,
  p_embedding extensions.vector(768),
  p_terms text[],
  p_portal_id bigint default null,
  p_limit int default 30
)
returns table (shop_id uuid, url text, genre text, sim real, kw boolean, score real)
language sql
stable
set search_path = wp_inquiry, public, extensions
as $$
  with s as (select * from wp_inquiry.concierge_settings where id),
  base as (
    select i.shop_id, i.url, i.genre,
      case when i.embedding is null or p_embedding is null then 0 else (1 - (i.embedding <=> p_embedding))::real end as sim,
      (coalesce(array_length(p_terms, 1), 0) > 0 and i.search_text ilike any (select '%' || t || '%' from unnest(p_terms) t)) as kw,
      i.fresh, i.paid
    from wp_inquiry.shop_index i
    where i.scope_key = p_scope
      and (p_portal_id is null or i.portal_id = p_portal_id)
  )
  select b.shop_id, b.url, b.genre, b.sim, b.kw,
    (s.w_sem * b.sim + s.w_kw * (case when b.kw then 1 else 0 end) + s.w_fresh * b.fresh + s.w_paid * b.paid)::real as score
  from base b, s
  order by score desc
  limit greatest(p_limit, 1)
$$;

-- ジャンルごとの上位(新しさ・有料の順)。どんな質問が来ても、いろいろなジャンルの店が必ず資料に入るようにする。
create or replace function wp_inquiry.diverse_shop_index(
  p_scope text,
  p_portal_id bigint default null,
  p_per_genre int default 3
)
returns table (shop_id uuid, url text, genre text)
language sql
stable
set search_path = wp_inquiry, public, extensions
as $$
  with s as (select * from wp_inquiry.concierge_settings where id)
  select r.shop_id, r.url, r.genre from (
    select i.shop_id, i.url, i.genre,
      row_number() over (partition by coalesce(i.genre, '') order by (s.w_fresh * i.fresh + s.w_paid * i.paid) desc, i.title) as rn
    from wp_inquiry.shop_index i, s
    where i.scope_key = p_scope and (p_portal_id is null or i.portal_id = p_portal_id)
  ) r
  where r.rn <= greatest(p_per_genre, 1)
$$;

revoke all on function wp_inquiry.search_shop_index(text, extensions.vector, text[], bigint, int) from public, anon, authenticated;
revoke all on function wp_inquiry.diverse_shop_index(text, bigint, int) from public, anon, authenticated;
grant execute on function wp_inquiry.search_shop_index(text, extensions.vector, text[], bigint, int) to service_role;
grant execute on function wp_inquiry.diverse_shop_index(text, bigint, int) to service_role;
grant select, insert, update, delete on wp_inquiry.shop_index to service_role;
grant select on wp_inquiry.concierge_settings to service_role;

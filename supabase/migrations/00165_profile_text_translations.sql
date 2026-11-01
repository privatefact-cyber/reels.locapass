-- キャストの自己紹介(pr_text)・スタッフの紹介文(bio)も、リール本文と同じく投稿言語を自動判定して多言語化する。
-- LUXELA(cast_members / shop_staff_members)と locapass(locapass_cast_members / locapass_shop_staff_members)の両方。
-- 保存: 翻訳 jsonb({source_hash, source_lang, ja/en/zh/ar: {<列名>: 訳文}})。原文の言語と同じ言語の訳は持たない。
-- 実行: テーブルへのINSERT / 対象列のUPDATEをきっかけに、Edge Function(reel-caption-translate)をpg_net経由で叩く(00130と同じ)。

alter table public.cast_members add column if not exists pr_text_translations jsonb;
alter table public.locapass_cast_members add column if not exists pr_text_translations jsonb;
alter table public.shop_staff_members add column if not exists bio_translations jsonb;
alter table public.locapass_shop_staff_members add column if not exists bio_translations jsonb;

-- cast_members は列ごとにSELECTを許可している(身分証関連の列を隠すため)ので、新しい列も明示的に許可する。
grant select (pr_text_translations) on public.cast_members to anon, authenticated;
grant select (pr_text_translations) on public.locapass_cast_members to anon, authenticated;
grant select (bio_translations) on public.shop_staff_members to anon, authenticated;
grant select (bio_translations) on public.locapass_shop_staff_members to anon, authenticated;

-- locapassの公開用ビューにも翻訳を出す(列は末尾に足す)。
create or replace view public.locapass_public_casts as
 select c.id,
    c.shop_id,
    c.name,
    c.age,
    c.sizes,
    c.pr_text,
    c.avatar_url,
    c.cast_code,
    c.created_at,
    c.updated_at,
    c.issue_no,
    c.pr_text_translations
   from public.locapass_cast_members c
     join public.locapass_shops s on s.id = c.shop_id
  where s.status = 'active'::text and c.deleted_at is null;

-- 翻訳の依頼(Edge Functionを非同期に叩く)。pg_netのスキーマは環境依存のため実体を探して呼ぶ(00057と同じ)。
create or replace function public.dispatch_text_translation(p_table text, p_column text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'http_post'
  limit 1;

  if v_schema is not null then
    begin
      execute format(
        'select %I.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb, timeout_milliseconds := 60000)',
        v_schema,
        'https://ezhbjfkbfjgijdcvmzdi.supabase.co/functions/v1/reel-caption-translate',
        jsonb_build_object('table', p_table, 'column', p_column, 'id', p_id)::text,
        jsonb_build_object('Content-Type', 'application/json')::text
      );
    exception when others then
      -- 依頼に失敗しても、保存そのものは通す。
      raise warning 'text translation dispatch failed: %', sqlerrm;
    end;
  end if;
end;
$$;

-- 汎用トリガー関数: 引数1に対象の列名。本文が空、または更新で変わっていなければ何もしない。
create or replace function public.trg_dispatch_text_translation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_col text := tg_argv[0];
  v_new text := to_jsonb(new) ->> v_col;
begin
  if v_new is null or btrim(v_new) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(old) ->> v_col) is not distinct from v_new then
    return new;
  end if;
  perform public.dispatch_text_translation(tg_table_name, v_col, (to_jsonb(new) ->> 'id')::uuid);
  return new;
end;
$$;

drop trigger if exists trg_cast_members_translate_pr_text on public.cast_members;
create trigger trg_cast_members_translate_pr_text
  after insert or update of pr_text on public.cast_members
  for each row execute function public.trg_dispatch_text_translation('pr_text');

drop trigger if exists trg_locapass_cast_members_translate_pr_text on public.locapass_cast_members;
create trigger trg_locapass_cast_members_translate_pr_text
  after insert or update of pr_text on public.locapass_cast_members
  for each row execute function public.trg_dispatch_text_translation('pr_text');

drop trigger if exists trg_shop_staff_members_translate_bio on public.shop_staff_members;
create trigger trg_shop_staff_members_translate_bio
  after insert or update of bio on public.shop_staff_members
  for each row execute function public.trg_dispatch_text_translation('bio');

drop trigger if exists trg_locapass_shop_staff_members_translate_bio on public.locapass_shop_staff_members;
create trigger trg_locapass_shop_staff_members_translate_bio
  after insert or update of bio on public.locapass_shop_staff_members
  for each row execute function public.trg_dispatch_text_translation('bio');

-- 既存の自己紹介・紹介文を翻訳する(件数が少ないので1回だけ依頼する。冪等なので再実行しても二重に翻訳しない)。
select public.dispatch_text_translation('cast_members', 'pr_text', id) from public.cast_members where pr_text is not null and btrim(pr_text) <> '';
select public.dispatch_text_translation('locapass_cast_members', 'pr_text', id) from public.locapass_cast_members where pr_text is not null and btrim(pr_text) <> '';
select public.dispatch_text_translation('shop_staff_members', 'bio', id) from public.shop_staff_members where bio is not null and btrim(bio) <> '';
select public.dispatch_text_translation('locapass_shop_staff_members', 'bio', id) from public.locapass_shop_staff_members where bio is not null and btrim(bio) <> '';

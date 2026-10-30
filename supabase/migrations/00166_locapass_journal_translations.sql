-- Journal記事の自動翻訳。タイトル・要約・導入・本文・写真の説明を、原文以外の表示言語(日・英・中・アラビア語)に訳して持つ。
-- 形は他の翻訳列と同じ(lib/i18n/contentTranslation.ts): { source_hash, source_lang, en, zh, ar, ja }。
-- 本文のブロックは、キー(b0, b1, b2_0 …)で項目ごとに持ち、表示のときに元のブロックの形へ当てはめる。
alter table public.locapass_journal_posts
  add column if not exists translations jsonb not null default '{}'::jsonb;

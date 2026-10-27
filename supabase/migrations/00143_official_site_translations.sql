-- 公式サイトの文言の翻訳(英語・中国語)。2026-10-28。形式は他の translations と同じ(source_hash + en/zh)。
-- ブログ記事(official_posts)は 00141 で translations 列を作成済み。
alter table public.official_site_content add column if not exists translations jsonb not null default '{}'::jsonb;

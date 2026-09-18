-- 店舗が日本語で入力した文章の自動翻訳(英語・中国語)を保存する列。
-- 店舗が保存したタイミングで Gemini で翻訳し(lib/i18n/contentTranslation.ts)、表側は言語設定に応じて出し分ける。
-- 形式: {"source_hash": "<翻訳元のハッシュ>", "en": {"description": "..."}, "zh": {...}}
-- source_hash が今の日本語と一致しない(=翻訳後に日本語が変わった)ときは、翻訳し直すまで日本語のまま表示する。

alter table public.shops add column if not exists translations jsonb not null default '{}'::jsonb;
alter table public.shop_price_items add column if not exists name_translations jsonb not null default '{}'::jsonb;
alter table public.shop_events add column if not exists translations jsonb not null default '{}'::jsonb;

-- 掲載アイテムの多言語翻訳(2026-10-27)。形式は shops.translations と同じ(source_hash + en/zh/ar)。
-- 翻訳元は title / description / price_label と、年式・車検・色(attributes内の文字)。
alter table public.locapass_shop_items add column if not exists translations jsonb not null default '{}'::jsonb;

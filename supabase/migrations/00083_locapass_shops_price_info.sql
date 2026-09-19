-- 店舗管理画面の基本情報フォームが送っている料金情報(name="price_info")の受け皿。
-- LUXELA本家shops.price_infoと同じくテキストで持つ。
-- 英語・中国語訳は既存のtranslations列({source_hash, en:{...}, zh:{...}})に
-- price_info / usage_notes キーで保存するため、翻訳用の列は追加しない(本家と同じ方式)。
alter table public.locapass_shops
  add column if not exists price_info text;

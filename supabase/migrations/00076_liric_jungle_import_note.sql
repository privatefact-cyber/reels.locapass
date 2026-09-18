-- LIRIC TOKYO ROPPONGI / JUNGLE TOKYO / JUNGLE SECOND / JUNGLE GINZA EDITION の
-- 公式サイトからの取り込み(2026-09-14、掲載許諾・素材連携は合意済み)。
--
-- 実際のデータ投入(shops.description/price_info/usage_notes/translations/hero_media_url/featured_rank、
-- shop_price_items)は運営権限で直接実行済みのため、この移行ファイルは記録用(再実行しない)。
-- 対象店舗ID:
--   3a15c96c-1149-4645-929a-ca39511958fc (LIRIC TOKYO ROPPONGI, featured_rank=1)
--   7af4c332-a711-436a-a497-944cbcac52ad (JUNGLE TOKYO, featured_rank=2)
--   8ebabb1a-a8eb-42b4-aa6c-e902de02d5ce (JUNGLE SECOND)
--   771a230c-7ef1-4809-b929-944c184a7c2c (JUNGLE GINZA EDITION)
--
-- LIRIC/JUNGLE TOKYOの写真は public/featured/ に取り込み、hero_media_url に相対パスで設定した
-- (Supabase Storageではなくアプリの静的アセットとして配信。理由: トップFEATURED専用の1枚物で、
-- 店舗が差し替える運用にする際はダッシュボードのアップローダー経由でStorageに移す)。
-- JUNGLE SECOND / JUNGLE GINZA EDITIONは公式サイトに使える解像度の写真が無かったため、
-- 文章・料金表のみ反映し、featured_rank は付けていない(ヒーロー/特集カードには出ない)。

select 1; -- no-op(記録用)

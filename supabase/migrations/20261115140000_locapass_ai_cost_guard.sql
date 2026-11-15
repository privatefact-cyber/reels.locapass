-- 店舗AIの費用の防御(LOCAPASS側の列)。共通のカウンター表・回答キャッシュ・ai_take_quota は、LUXELAのリポジトリの移行(00155)にある。
alter table public.locapass_shop_ai_chats add column if not exists source text;
-- 店舗ごとの1日の上限(未設定は400)。
alter table public.locapass_shops add column if not exists ai_daily_limit integer;

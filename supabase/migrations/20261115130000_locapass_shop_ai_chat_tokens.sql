-- 店舗AIの質問ログに、AIが使ったトークン数(入力・キャッシュ済み・出力)を残す。実際の1回あたりの費用を、あとから計算できるようにする。
alter table public.locapass_shop_ai_chats add column if not exists prompt_tokens integer;
alter table public.locapass_shop_ai_chats add column if not exists cached_tokens integer;
alter table public.locapass_shop_ai_chats add column if not exists output_tokens integer;

-- リール字幕に、動画の音声の母国語そのもの(ja/en/zh以外。タガログ語・ロシア語など)の字幕も保存できるようにする。
-- lang は ISO 639 の言語コード(2〜3文字の小文字)。ja/en/zh は従来どおり。
-- (locapass の locapass_reel_captions も同じDBなので、同じ制約に広げる。)
alter table public.reel_captions drop constraint if exists reel_captions_lang_check;
alter table public.reel_captions add constraint reel_captions_lang_check check (lang ~ '^[a-z]{2,3}$');

alter table public.locapass_reel_captions drop constraint if exists locapass_reel_captions_lang_check;
alter table public.locapass_reel_captions add constraint locapass_reel_captions_lang_check check (lang ~ '^[a-z]{2,3}$');

-- リール字幕にアラビア語を追加し、字幕の原文の言語を持たせる。
--   locapass_reel_captions.lang        : ja / en / zh に ar を追加
--   locapass_reels.caption_source_lang : 動画の音声の言語(ja/en/zh/ar、それ以外は other)。
--     焼き込み字幕は音声と同じ言語で入っていることが多く、その言語の字幕だけ二重表示を避けるのに使う。
--     これまでの動画は日本語として扱う(default 'ja')。

alter table public.locapass_reel_captions
  drop constraint if exists locapass_reel_captions_lang_check;
alter table public.locapass_reel_captions
  add constraint locapass_reel_captions_lang_check check (lang in ('ja', 'en', 'zh', 'ar'));

alter table public.locapass_reels
  add column if not exists caption_source_lang text not null default 'ja';

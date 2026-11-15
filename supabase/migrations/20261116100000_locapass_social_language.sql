-- SNS自動投稿の言語設定(アカウントごと): ja=日本語 / mix=日本語と英語まじり / en=英語のみ。
-- mix・en のときは、文末のURLも英語版(/en/…)にして、海外からの訪問を英語ページへ流す。
alter table public.locapass_social_settings
  add column if not exists language text not null default 'ja' check (language in ('ja', 'mix', 'en'));

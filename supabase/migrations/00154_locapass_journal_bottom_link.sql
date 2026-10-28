-- Journal記事の一番下に出す、任意のリンク(ボタン)。link_url が空なら、何も出さない。
-- link_url は、サイト内のパス(/journal/…)か、http(s)のURLだけ。link_label は、ボタンの文字(空なら「詳しくはこちら」)。
alter table public.locapass_journal_posts
  add column if not exists link_url text check (link_url is null or link_url ~ '^(https?://|/)[^[:space:]]+$'),
  add column if not exists link_label text check (link_label is null or char_length(link_label) <= 60);

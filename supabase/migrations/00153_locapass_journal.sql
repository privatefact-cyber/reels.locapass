-- LOCAPASS Journal(/journal)の記事と、記事を書ける「投稿担当」。
-- 書けるのは、ルート管理者(locapass_super_admins)と、ルート管理者が指名した投稿担当だけ。公開された記事は誰でも読める。
-- 本文(body)は、見出し・段落・箇条書き・写真のブロックの配列(JSON)。アプリ側で形を検証してから保存する。

create table if not exists public.locapass_journal_editors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.locapass_journal_editors enable row level security;

-- 投稿の権限(ルート管理者 or 投稿担当)。RLSの判定とアプリの両方から使う。
create or replace function public.locapass_is_journal_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.locapass_is_super_admin()
    or exists (select 1 from public.locapass_journal_editors where user_id = auth.uid())
$$;
grant execute on function public.locapass_is_journal_editor() to anon, authenticated;

-- 投稿担当の一覧・追加・削除。見られるのはルート管理者と本人だけ、追加と削除はルート管理者だけ。
create policy "journal editors read" on public.locapass_journal_editors
  for select to authenticated
  using (public.locapass_is_super_admin() or user_id = auth.uid());
create policy "journal editors manage by super admin" on public.locapass_journal_editors
  for all to authenticated
  using (public.locapass_is_super_admin())
  with check (public.locapass_is_super_admin());
grant select, insert, update, delete on public.locapass_journal_editors to authenticated;

create table if not exists public.locapass_journal_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  category text not null check (category in ('topics', 'tips')),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 400),
  lead text check (lead is null or char_length(lead) <= 400),
  cover_url text,
  cover_alt text,
  body jsonb not null default '[]'::jsonb check (jsonb_typeof(body) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_on date not null default ((now() at time zone 'Asia/Tokyo')::date),
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists locapass_journal_posts_status_idx on public.locapass_journal_posts (status, published_on desc);

create trigger trg_locapass_journal_posts_updated_at
  before update on public.locapass_journal_posts
  for each row execute function public.set_updated_at();

alter table public.locapass_journal_posts enable row level security;

-- 公開済みの記事は誰でも読める(anonとログイン中の両方。CLAUDE.mdの注意)。
create policy "journal public read published" on public.locapass_journal_posts
  for select to anon, authenticated
  using (status = 'published');
-- 下書きを含めた全記事の閲覧と、書き込みは、ルート管理者と投稿担当だけ。
create policy "journal editors read all" on public.locapass_journal_posts
  for select to authenticated
  using (public.locapass_is_journal_editor());
create policy "journal editors insert" on public.locapass_journal_posts
  for insert to authenticated
  with check (public.locapass_is_journal_editor());
create policy "journal editors update" on public.locapass_journal_posts
  for update to authenticated
  using (public.locapass_is_journal_editor())
  with check (public.locapass_is_journal_editor());
create policy "journal editors delete" on public.locapass_journal_posts
  for delete to authenticated
  using (public.locapass_is_journal_editor());
grant select on public.locapass_journal_posts to anon;
grant select, insert, update, delete on public.locapass_journal_posts to authenticated;

-- コードに書いていた最初の2記事を移す。
insert into public.locapass_journal_posts (slug, category, title, description, lead, cover_url, cover_alt, body, status, published_on)
values ($j$post-photo-video-to-this-shop$j$, $j$topics$j$, $j$おいしかった一皿を、そのお店のページに。写真・動画の投稿が、もっと気軽になりました$j$, $j$お店のページの「このお店の写真・動画を投稿」から、そのお店にそのまま載せられるようになりました。帰ってからの投稿もOKです。$j$, $j$「この一皿、あのお店のページに載せたいな」。そんな気持ちを、ひと手間でかなえられるようにしました。$j$, $j$/journal/dish.jpg$j$, $j$和食の定食$j$, $j$[{"type":"h2","text":"お店のページから、そのまま投稿"},{"type":"p","text":"お店のページを開くと、「＋ このお店の写真・動画を投稿」というボタンがあります。ここから投稿した写真や動画は、必ずそのお店のページ(LOCA SNAP)に並びます。"},{"type":"p","text":"場所を入れたり、近くのお店の候補から選んだりする手間はありません。写真か動画を選んで、ひとことを添えるだけ。ひとことが思いつかないときは、AIにおまかせもできます。"},{"type":"h2","text":"帰ってから、ゆっくり載せてもOK"},{"type":"image","src":"/journal/udon.jpg","alt":"湯気のたつうどん","caption":"写真はイメージです"},{"type":"p","text":"お店を出たあと、家でゆっくり「やっぱり載せようかな」と思うこと、ありますよね。お店のページから投稿すれば、写真に位置情報が入っていなくても大丈夫。ピンは、ちゃんとそのお店に立ちます。口コミを書くような気持ちで、気軽に使ってみてください。"},{"type":"h2","text":"街の景色や穴場は、これまでどおり"},{"type":"p","text":"お店とは関係のない、街の景色や見つけた穴場は、スナップの投稿画面から。こちらは、撮った場所にピンが立ちます。"},{"type":"p","text":"動画は30秒・50MBまで。まだ写真が1枚もないお店にも、投稿の入口が出ています。ぜひ、最初の1枚を載せてみてください。"}]$j$::jsonb, 'published', '2026-10-28')
on conflict (slug) do nothing;
insert into public.locapass_journal_posts (slug, category, title, description, lead, cover_url, cover_alt, body, status, published_on)
values ($j$snap-check-and-fix-address$j$, $j$tips$j$, $j$写真の場所がちがっていたら? 住所は、その場で直せます$j$, $j$スナップ投稿では、写真の位置情報から住所が自動で入ります。ずれていても、書き換えてすぐ直せます。位置情報のない写真の載せ方もご紹介します。$j$, $j$地図にピンが立つのが、スナップの楽しいところ。場所がずれていたときの直し方を、サクッとまとめました。$j$, $j$/journal/street.jpg$j$, $j$夜の街の看板$j$, $j$[{"type":"h2","text":"住所は、自動で入ります"},{"type":"p","text":"写真や動画に位置情報が入っていれば、それを読み取って、撮った場所の住所が「撮影場所の住所」の欄に自動で入ります。近くのお店やスポットも、候補として出てきます。"},{"type":"h2","text":"ずれていたら、書き換えて「位置を確認」"},{"type":"ul","items":["合っていれば、そのまま投稿できます。","ちがっていたら、住所を書き換えて「位置を確認」を押してください。ピンの位置と、近くの候補が新しくなります。","押し忘れても大丈夫。投稿するときに、書き換えた住所から場所を取り直します。"]},{"type":"h2","text":"位置情報のない写真は?"},{"type":"p","text":"住所や地名を入れて「位置を確認」を押せば、投稿できます。場所が決まらないとピンが立てられないので、投稿ボタンは、場所が決まるまでお待ちください。"},{"type":"h2","text":"見つからないときのコツ"},{"type":"p","text":"「東京都渋谷区神宮前5-3-12」のように、都道府県から番地まで書くと、見つかりやすくなります。"},{"type":"p","text":"もし、特定のお店の写真として載せたいときは、そのお店のページの「このお店の写真・動画を投稿」から。場所の入力は、いりません。"}]$j$::jsonb, 'published', '2026-10-28')
on conflict (slug) do nothing;

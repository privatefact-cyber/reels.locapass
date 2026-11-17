-- 店舗の「ひとこと」: 動画を撮らなくても、数秒で書ける短い文章の投稿(Threads/Xのような軽い投稿)。写真は1枚まで添付できる(任意)。
--   ・投稿できるのは、その店の管理者(店舗管理者・ポータル管理者・システム管理者)。書き込みはサーバー(service role)だけ。
--   ・消せるのは、投稿者本人とシステム管理者(リールと同じ)。消した投稿は deleted_at を入れて残す(運営の確認用)。
--   ・店舗ページには「直近7日の最新1件」を出し、過去の全件は、店ごとの一覧ページ・ポータルごとのタイムラインに出す。
--   ・誰でも読める(deleted_at が空で、店が公開中のものだけ)。

create table if not exists public.locapass_shop_murmurs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 100),
  image_url text,
  author_user_id uuid not null,
  author_name text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid
);

create index if not exists locapass_shop_murmurs_shop_idx
  on public.locapass_shop_murmurs (shop_id, created_at desc) where deleted_at is null;
create index if not exists locapass_shop_murmurs_recent_idx
  on public.locapass_shop_murmurs (created_at desc) where deleted_at is null;

alter table public.locapass_shop_murmurs enable row level security;

drop policy if exists "anyone reads live murmurs" on public.locapass_shop_murmurs;
create policy "anyone reads live murmurs" on public.locapass_shop_murmurs
  for select to anon, authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.locapass_shops s where s.id = shop_id and s.status = 'active')
  );

-- 店の管理者は、削除済みも含めて自店の分を読める(管理画面の一覧用)。
drop policy if exists "shop admins read own murmurs" on public.locapass_shop_murmurs;
create policy "shop admins read own murmurs" on public.locapass_shop_murmurs
  for select to authenticated
  using (public.locapass_is_shop_admin(shop_id));

-- 書き込み(insert/update/delete)のポリシーは置かない = service role のサーバー処理だけが書く。

-- システム管理者専用の広告(PR)投稿。店舗・キャストは投稿できず、運営(admin)のみが
-- リールフィードに紛れ込ませるPRカードを作成する。マネタイズ方法は未定のため、
-- 課金・掲載期間などは持たず、まずは「有効/無効」と「表示頻度」だけを持つ最小構成にする。
create table public.ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  media_type text not null check (media_type in ('video', 'image')),
  media_url text not null,
  poster_url text,
  link_url text not null,
  -- リールを何件表示するごとに1回挟むか(例: 8なら8件ごとに1回)。
  frequency integer not null default 10 check (frequency >= 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_ads_active on public.ads (is_active);

alter table public.ads enable row level security;

-- 閲覧は誰でも可(公開フィードに混ぜて表示するため)。有効なものだけを見せる。
-- 書き込みはservice role(admin管理画面のserver action)経由のみで、
-- authenticated/anon向けのinsert/update/deleteポリシーは意図的に用意しない。
create policy "anon read active ads"
  on public.ads for select
  to anon, authenticated
  using (is_active = true);

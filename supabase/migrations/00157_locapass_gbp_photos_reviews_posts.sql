-- Googleビジネスプロフィール連携の拡張: 写真の送信・口コミの取得と返信・「最新情報」の投稿。
-- いずれも、Googleに接続されるまでは何も送らない(接続前は準備だけ)。AIによる自動返信は作らない。

alter table public.locapass_gbp_links
  add column if not exists gbp_account_id text,
  add column if not exists sync_reviews boolean not null default true,
  -- 写真の自動送信は、店舗の明示的な同意を取ってからだけオンにできる(同意した日時・記録した人・同意の取り方を残す)
  add column if not exists sync_photos boolean not null default false,
  add column if not exists photos_consent_at timestamptz,
  add column if not exists photos_consent_by uuid references auth.users(id) on delete set null,
  add column if not exists photos_consent_note text;

-- Googleに送った写真(同じ写真を二重に送らないための記録)。送るのは店舗自身が登録した写真だけ。
create table if not exists public.locapass_gbp_sent_media (
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  source_url text not null,
  google_media_name text,
  sent_at timestamptz not null default now(),
  primary key (shop_id, source_url)
);
alter table public.locapass_gbp_sent_media enable row level security;
create policy "super admins manage gbp sent media" on public.locapass_gbp_sent_media
  for all to authenticated
  using (exists (select 1 from public.locapass_super_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.locapass_super_admins a where a.user_id = auth.uid()));

-- Googleの口コミの写し。書き込みはサーバー側(service role)だけ。読めるのはその店舗の管理者とポータル管理者。
create table if not exists public.locapass_gbp_reviews (
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  review_id text not null,
  reviewer_name text,
  star_rating smallint check (star_rating between 1 and 5),
  comment text,
  review_created_at timestamptz,
  review_updated_at timestamptz,
  reply_comment text,
  reply_updated_at timestamptz,
  -- 店舗へ通知した時点の review_updated_at(口コミが編集されたときだけ、もう一度知らせるため)
  notified_for timestamptz,
  fetched_at timestamptz not null default now(),
  primary key (shop_id, review_id)
);
create index if not exists locapass_gbp_reviews_shop_idx on public.locapass_gbp_reviews (shop_id, review_created_at desc);
alter table public.locapass_gbp_reviews enable row level security;
create policy "shop admins read gbp reviews" on public.locapass_gbp_reviews
  for select to authenticated
  using (public.locapass_is_shop_admin(shop_id));

-- Googleの「最新情報」への投稿の記録。
create table if not exists public.locapass_gbp_posts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  summary text not null check (char_length(summary) between 1 and 1500),
  link_url text,
  photo_url text,
  status text not null check (status in ('ok', 'dry_run', 'error')),
  google_post_name text,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists locapass_gbp_posts_shop_idx on public.locapass_gbp_posts (shop_id, created_at desc);
alter table public.locapass_gbp_posts enable row level security;
create policy "super admins manage gbp posts" on public.locapass_gbp_posts
  for all to authenticated
  using (exists (select 1 from public.locapass_super_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.locapass_super_admins a where a.user_id = auth.uid()));
create policy "shop admins read gbp posts" on public.locapass_gbp_posts
  for select to authenticated
  using (public.locapass_is_shop_admin(shop_id));

-- 口コミの通知種別を許可する(既存の種別はそのまま)。
alter table public.locapass_notifications drop constraint if exists locapass_notifications_type_check;
alter table public.locapass_notifications add constraint locapass_notifications_type_check
  check (type = any (array['new_cast','new_event','new_shop_reel','new_cast_reel','shop_message','admin_message','staff_dm','photo_like','photo_follow',
    'reservation_request','reservation_confirmed','reservation_declined','reservation_cancelled','google_review']));

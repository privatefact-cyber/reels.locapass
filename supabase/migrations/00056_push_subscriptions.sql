-- Web Push通知の購読情報(ブラウザのPushSubscription)を保存するテーブル。
-- 一般ユーザー(フォロワー)のマイページから「通知を受け取る」を有効にした端末ごとに1行。
-- 同じユーザーが複数端末で購読するケースがあるため、endpoint単位でユニークにする
-- (endpointはブラウザ・端末の組み合わせごとに異なるURLになる)。
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- 自分の購読の登録・閲覧・解除のみ許可(送信側はservice roleで叩くためRLSを経由しない)。
create policy "user manage own push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

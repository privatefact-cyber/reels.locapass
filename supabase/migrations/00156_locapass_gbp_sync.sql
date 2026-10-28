-- Googleビジネスプロフィールへの同期(代行運用)。
-- 運営のGoogleアカウントが各店舗のプロフィールの「管理者」として招待されている前提で、
-- locapass側の店舗情報(営業時間・電話・説明文・臨時休業)をGoogleへ送る。
-- 店舗ごとのOAuthトークンは持たない(運営アカウントのトークンは環境変数)。ここには店舗とGoogleの紐付けだけを置く。
create table if not exists public.locapass_gbp_links (
  shop_id uuid primary key references public.locapass_shops(id) on delete cascade,
  -- 例: locations/1234567890123456789 (Business Information APIのlocation名)
  gbp_location_id text not null,
  enabled boolean not null default true,
  sync_hours boolean not null default true,
  sync_phone boolean not null default true,
  -- 店主がGoogle側で丁寧に書いた説明文を上書きしないよう、既定はオフ
  sync_description boolean not null default false,
  last_synced_at timestamptz,
  -- ok=Googleへ送信成功 / dry_run=未接続のため送信内容の確認のみ / error=失敗
  last_status text check (last_status in ('ok', 'dry_run', 'error')),
  last_error text,
  last_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.locapass_gbp_links enable row level security;

-- 公開ページでは使わない運営専用テーブル。閲覧・操作ともに super_admin のみ(anon/一般ログインには何も見せない)。
create policy "super admins manage gbp links" on public.locapass_gbp_links
  for all to authenticated
  using (exists (select 1 from public.locapass_super_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.locapass_super_admins a where a.user_id = auth.uid()));

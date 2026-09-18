-- LINEログイン連携用のIDマッピングテーブル。
-- SupabaseにLINEを直接サポートするOAuthプロバイダーが無いため、
-- サーバー側(app/api/auth/line/*)でLINEの認可コードフローを自前実装し、
-- LINEのuser_id(sub)とSupabaseのauth.users.idを紐付けるためだけに使う。
-- service_role(サーバー)からしか触らないテーブルなので、
-- anon/authenticated向けのポリシーは一切用意しない(RLS有効・ポリシー0件=デフォルト拒否)。
create table public.line_identities (
  line_user_id text primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.line_identities enable row level security;

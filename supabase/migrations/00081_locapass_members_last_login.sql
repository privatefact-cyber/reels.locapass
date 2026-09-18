-- auth/callbackでのログイン時に「最終ログイン日時」を記録するための列。
-- 新規登録かどうかの判定にも使う(無ければ初回ログイン)。
alter table public.locapass_members
  add column if not exists last_login_at timestamptz not null default now();

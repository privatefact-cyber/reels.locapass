-- サポートAIへの質問ログ。「答えられなかった質問」を見て、足りない機能カード(マニュアル)を補うために使う。(2026-10-15)
-- 書き込みはサーバー(service role)だけ。個人を特定する情報は保存しない(ログイン状態の有無と立場だけ)。
create table if not exists public.locapass_support_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) <= 500),
  answered boolean not null,
  audience text not null check (audience in ('user', 'shop')),
  path text,
  locale text,
  created_at timestamptz not null default now()
);
create index if not exists locapass_support_questions_unanswered_idx on public.locapass_support_questions (created_at desc) where answered = false;
alter table public.locapass_support_questions enable row level security;

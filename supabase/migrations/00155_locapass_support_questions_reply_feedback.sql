-- サポートAIの記録に、AIの返事・使った機能カード・利用者の評価(役に立った/立たなかった)を足す。(2026-10-28)
-- これまでどおり、書き込みと読み取りはサーバー(service role)だけ(RLSで閉じたまま)。
alter table public.locapass_support_questions
  add column if not exists reply text check (reply is null or char_length(reply) <= 2000),
  add column if not exists doc_ids text[] not null default '{}',
  add column if not exists feedback smallint check (feedback in (-1, 1)),
  add column if not exists feedback_at timestamptz;
create index if not exists locapass_support_questions_feedback_idx on public.locapass_support_questions (created_at desc) where feedback = -1;

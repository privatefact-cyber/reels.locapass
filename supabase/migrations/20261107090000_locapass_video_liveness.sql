-- 収集した動画が削除・非公開・埋め込み禁止になっていないかを毎日確認し、連続で見つからなければリールを自動で下書きに戻す。
-- 自動で下げたものだけ auto_hidden_at を持ち、動画が復活したらそれだけを公開に戻す(手動で下書きにしたリールには触らない)。
alter table public.locapass_youtube_ingestions
  add column if not exists liveness_checked_at timestamptz,
  add column if not exists liveness_fail_count integer not null default 0,
  add column if not exists liveness_reason text,
  add column if not exists auto_hidden_at timestamptz;

create index if not exists locapass_youtube_ingestions_auto_hidden_idx
  on public.locapass_youtube_ingestions (auto_hidden_at) where auto_hidden_at is not null;

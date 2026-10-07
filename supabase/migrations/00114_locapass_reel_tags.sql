-- リールの自動タグ(店舗内の過去動画を「料理」「店内」などで絞り込むため)。
--   locapass_reels.tags              : タグID(固定の辞書。lib/reels/tags/vocabulary.ts)の配列。表示は言語ごとに辞書から引く。
--   locapass_reels.tags_status       : pending(処理中) / ready / failed。NULL=未処理
--   locapass_reels.tags_generated_at : 処理した時刻(1日の上限の集計と、固まった処理中の判定に使う)
-- 付与はVercelのAPI(/api/reels/[id]/tags と字幕処理の後続)が投稿者のセッションで書き込む(service roleは使わない)。
-- 既存のlocapass_reelsの更新RLS(投稿者本人/店舗スタッフ)がそのまま効くので、ポリシーの追加は不要。

alter table public.locapass_reels
  add column if not exists tags text[] not null default '{}',
  add column if not exists tags_status text
    check (tags_status in ('pending', 'ready', 'failed')),
  add column if not exists tags_generated_at timestamptz;

create index if not exists locapass_reels_tags_idx on public.locapass_reels using gin (tags);
create index if not exists locapass_reels_tags_generated_idx
  on public.locapass_reels (tags_generated_at desc) where tags_generated_at is not null;

-- キャストが自分のプロフィールで気に入ったリールをピン留めし、投稿グリッドの
-- 先頭に固定表示できるようにする(インスタの「固定投稿」と同じ発想)。
-- 複数ピン留め時の並び順を決めるためtimestampで持つ(新しくピン留めしたものが先頭)。
-- 最大3件までの制限はアプリ側(CastMypageClient)で担保する。
alter table public.reels add column pinned_at timestamptz;

create index reels_cast_pinned_idx on public.reels(cast_id, pinned_at desc);

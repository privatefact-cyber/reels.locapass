-- ダミー(イメージ映像)のリールの目印。Pexelsの無料動画を、写真/動画が無い店舗のフィードの見た目を整えるために流す。
-- 本物の投稿が入ったら scripts/seed-placeholder-reels.ts --remove でまとめて消せる。
-- ダミーの閲覧は投稿者向けインサイトに数えない(locapass_record_event を更新)。
alter table public.locapass_reels
  add column if not exists is_placeholder boolean not null default false;

create index if not exists locapass_reels_placeholder_idx on public.locapass_reels (is_placeholder) where is_placeholder;

-- locapass_record_event: 閲覧対象の条件に「and not is_placeholder」を追加(本体は 00115 と同じ)。
-- 適用済みの定義は DB 側を正とする(MCPで apply_migration 済み)。

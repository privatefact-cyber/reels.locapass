-- reels_author_check(00025)は「cast_id/posted_by_staff_idのどちらか片方が必須」だったため、
-- 店舗自身の投稿(両方null)がCHECK制約違反で保存できなかった。「0人か1人まで」に緩和する。
alter table public.reels drop constraint reels_author_check;
alter table public.reels add constraint reels_author_check check (num_nonnulls(cast_id, posted_by_staff_id) <= 1);

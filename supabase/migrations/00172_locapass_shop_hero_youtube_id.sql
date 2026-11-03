-- トップ(ヒーロー)に流すYouTubeを、ページ内の動画紹介(video_provider/video_ref)とは別の欄にする。
alter table public.locapass_shops add column if not exists hero_youtube_id text;
-- 「トップに流す」にチェックを入れていた店は、その動画をヒーロー用へ移し、ページ内の動画紹介は空にする(今も非表示のため見た目は変わらない)。
update public.locapass_shops
set hero_youtube_id = coalesce(case when video_provider = 'youtube' then video_ref end, youtube_video_id),
    video_provider = null, video_ref = null, youtube_video_id = null
where hero_use_youtube = true and coalesce(case when video_provider = 'youtube' then video_ref end, youtube_video_id) is not null;

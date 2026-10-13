-- エリアフォトの投稿者ページ用(2026-10-13)。写真を1枚でも投稿した会員の「表示名とアイコン」だけを公開で読めるようにする。
-- locapass_members本体は本人しか読めない(個人情報の列があるため)ので、公開してよい列だけのビューを別に用意する。
create or replace view public.locapass_public_members as
select m.id, m.nickname, m.avatar_url
from public.locapass_members m
where exists (select 1 from public.area_photo_posts p where p.member_id = m.id);

grant select on public.locapass_public_members to anon, authenticated;

-- 撮影者ページ(/photo/u/...)に載せる、本人が任意で入れるSNSリンク(2026-11-02)。
-- 保存するのは「ユーザー名」と「https のURL」だけにして、javascript: などの危険なURLを入れられないようにする。
alter table public.locapass_members
  add column if not exists sns_instagram text,
  add column if not exists sns_x text,
  add column if not exists sns_website text;

alter table public.locapass_members
  drop constraint if exists locapass_members_sns_instagram_chk,
  drop constraint if exists locapass_members_sns_x_chk,
  drop constraint if exists locapass_members_sns_website_chk;

alter table public.locapass_members
  add constraint locapass_members_sns_instagram_chk check (sns_instagram is null or sns_instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  add constraint locapass_members_sns_x_chk check (sns_x is null or sns_x ~ '^[A-Za-z0-9_]{1,15}$'),
  add constraint locapass_members_sns_website_chk check (sns_website is null or (sns_website ~ '^https://[^\s]+$' and length(sns_website) <= 200));

-- 公開用ビューに追加(列は末尾に足す)。写真を1枚でも投稿した会員だけが対象なのは変わらない。
create or replace view public.locapass_public_members as
select m.id, m.nickname, m.avatar_url, m.sns_instagram, m.sns_x, m.sns_website
from public.locapass_members m
where exists (select 1 from public.area_photo_posts p where p.member_id = m.id);

grant select on public.locapass_public_members to anon, authenticated;

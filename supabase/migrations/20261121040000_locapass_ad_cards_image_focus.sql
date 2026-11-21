-- 広告カードの画像の「見せたい中心位置」(0〜100%)。画像を枠に合わせて切り取るとき、この点が見えるようにする。2026-11-21。
alter table public.locapass_ad_cards add column if not exists image_focus_x smallint not null default 50;
alter table public.locapass_ad_cards add column if not exists image_focus_y smallint not null default 50;
alter table public.locapass_ad_cards drop constraint if exists locapass_ad_cards_image_focus_check;
alter table public.locapass_ad_cards add constraint locapass_ad_cards_image_focus_check check (image_focus_x between 0 and 100 and image_focus_y between 0 and 100);

-- 子ポータルごとの配色テーマ。null は「サイト全体の設定に従う」(platform_settings.locapass_site_theme → 自動)。
-- そのポータルのトップと、所属店舗の店舗ページに適用する。
-- 旧来のポータル配色(header_color / header_opacity / outer_background_color / font_color / accent_color /
-- background_color)はこのテーマに置き換えたため画面では使わない(列とデータは残す)。
-- 更新は既存の locapass_portals の更新ポリシー(ルート管理者・そのポータルの管理者)に従う。

alter table public.locapass_portals
  add column if not exists theme text;

alter table public.locapass_portals drop constraint if exists locapass_portals_theme_check;
alter table public.locapass_portals
  add constraint locapass_portals_theme_check
  check (theme is null or theme in ('default', 'christmas', 'beauty', 'nature'));

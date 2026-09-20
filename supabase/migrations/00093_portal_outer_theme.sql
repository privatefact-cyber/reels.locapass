alter table public.locapass_portals
  add column if not exists outer_background_color text not null default '#000000',
  add column if not exists font_color text not null default '#FFFFFF';

alter table public.locapass_portals
  drop constraint if exists locapass_portals_outer_background_color_check;
alter table public.locapass_portals
  add constraint locapass_portals_outer_background_color_check check (outer_background_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.locapass_portals
  drop constraint if exists locapass_portals_font_color_check;
alter table public.locapass_portals
  add constraint locapass_portals_font_color_check check (font_color ~ '^#[0-9A-Fa-f]{6}$');

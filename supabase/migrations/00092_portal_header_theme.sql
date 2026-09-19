alter table public.locapass_portals
  add column if not exists header_color text not null default '#25102F',
  add column if not exists header_opacity numeric(3,2) not null default 0.60;

alter table public.locapass_portals
  drop constraint if exists locapass_portals_header_color_check;
alter table public.locapass_portals
  add constraint locapass_portals_header_color_check check (header_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.locapass_portals
  drop constraint if exists locapass_portals_header_opacity_check;
alter table public.locapass_portals
  add constraint locapass_portals_header_opacity_check check (header_opacity >= 0 and header_opacity <= 1);

-- 店舗ページに出す写真の明示的な紐付け(attach)と、この店舗では出さない(hide)。
-- 本体はSupabaseに適用済み(apply_migration: shop_photo_links)。ここは記録用の写し。
create table if not exists public.locapass_shop_photo_links (
  post_id uuid not null references public.area_photo_posts(id) on delete cascade,
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  mode text not null check (mode in ('attach', 'hide')),
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (post_id, shop_id)
);
-- 関数 locapass_set_photo_shop_link(p_post_id, p_shop_id, p_mode): attach=ポータル管理者以上 / hide・clear=店舗管理者以上

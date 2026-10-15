-- 優先予約の改訂。(2026-10-15)
--  - デポジットは 1人500円・上限5,000円(アプリ側で算出して deposit_amount に保存)
--  - 保証方法: 直近の予約は与信保持(hold)、先の予約はカード保存(save、無断キャンセル時のみ請求)
--  - 没収したデポジットは、お店ごとの台帳(locapass_shop_credits)に積み、月額利用料の請求から控除する(振込なし)
alter table public.locapass_reservations
  add column if not exists payment_method text not null default 'hold' check (payment_method in ('hold', 'save')),
  add column if not exists card_fingerprint text;

create index if not exists locapass_reservations_fp_idx on public.locapass_reservations (card_fingerprint) where card_fingerprint is not null;

create table if not exists public.locapass_shop_credits (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  reservation_id uuid not null unique references public.locapass_reservations (id) on delete cascade,
  gross_amount int not null check (gross_amount >= 0),
  fee_amount int not null default 0 check (fee_amount >= 0),
  net_amount int not null check (net_amount >= 0),
  -- pending=月額への控除待ち / applied=控除済み(applied_note に請求書など)
  status text not null default 'pending' check (status in ('pending', 'applied')),
  applied_at timestamptz,
  applied_note text,
  created_at timestamptz not null default now()
);
create index if not exists locapass_shop_credits_shop_idx on public.locapass_shop_credits (shop_id, created_at desc);

alter table public.locapass_shop_credits enable row level security;
drop policy if exists shop_credit_read on public.locapass_shop_credits;
create policy shop_credit_read on public.locapass_shop_credits for select
  to authenticated using (public.locapass_is_shop_admin(shop_id));
grant select on public.locapass_shop_credits to authenticated;

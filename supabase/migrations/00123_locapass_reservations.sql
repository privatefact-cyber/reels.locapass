-- 優先予約・デポジット土管。(2026-10-15)
-- 席だけ確保+料理は現地アラカルト。客がデポジット(既定1,000円)の仮決済(与信)をして予約をリクエスト →
-- 店が「受ける/断る」→ 来店で枠解放(または会計に充当)/無断キャンセルなら店の売上として確定(キャプチャ)。
-- カード情報はStripeが保持し、DBには決済の参照ID(トークン)だけ持つ。Stripe接続前は payment_provider='stub'(課金なし)。
-- 予約・決済状態の書き込みはサーバー(service role)だけ。客・店はSELECTのみ。

create table if not exists public.locapass_reservations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  party_size int not null check (party_size between 1 and 20),
  reserve_at timestamptz not null,
  note text check (note is null or char_length(note) <= 300),
  contact_name text not null check (char_length(contact_name) between 1 and 40),
  contact_phone text not null check (char_length(contact_phone) between 8 and 20),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show')),
  deposit_amount int not null default 1000 check (deposit_amount >= 0),
  payment_provider text not null default 'stub' check (payment_provider in ('stub', 'stripe')),
  payment_status text not null default 'none'
    check (payment_status in ('none', 'authorized', 'released', 'captured', 'failed')),
  payment_ref text,
  shop_message text check (shop_message is null or char_length(shop_message) <= 300),
  responded_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists locapass_reservations_shop_idx on public.locapass_reservations (shop_id, reserve_at desc);
create index if not exists locapass_reservations_user_idx on public.locapass_reservations (user_id, created_at desc);

alter table public.locapass_reservations enable row level security;

drop policy if exists reservation_customer_read on public.locapass_reservations;
create policy reservation_customer_read on public.locapass_reservations for select
  to authenticated using (user_id = auth.uid());
drop policy if exists reservation_shop_read on public.locapass_reservations;
create policy reservation_shop_read on public.locapass_reservations for select
  to authenticated using (public.locapass_is_shop_admin(shop_id));

grant select on public.locapass_reservations to authenticated;

-- 予約の通知種別を許可する。
alter table public.locapass_notifications drop constraint if exists locapass_notifications_type_check;
alter table public.locapass_notifications add constraint locapass_notifications_type_check
  check (type = any (array['new_cast','new_event','new_shop_reel','new_cast_reel','shop_message','admin_message','staff_dm','photo_like','photo_follow',
    'reservation_request','reservation_confirmed','reservation_declined','reservation_cancelled']));

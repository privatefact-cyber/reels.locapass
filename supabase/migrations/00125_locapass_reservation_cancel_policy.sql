-- 優先予約: キャンセル方針(店舗ごと)と、店舗がワンタップで「請求なし/キャンセル料を請求」を選べる状態。(2026-10-15)
--  reservation_free_cancel_hours : 来店のN時間前までは、お客様が無料で取り消せる。それ以降の取り消しは「お店の判断待ち」になる。
--  status 追加: cancel_review(直前の取り消し=お店の判断待ち。カードは保持) / late_cancelled(事前連絡ありでキャンセル料を請求)
alter table public.locapass_shops
  add column if not exists reservation_free_cancel_hours int not null default 3
  check (reservation_free_cancel_hours between 0 and 72);

alter table public.locapass_reservations drop constraint if exists locapass_reservations_status_check;
alter table public.locapass_reservations add constraint locapass_reservations_status_check
  check (status in ('requested', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show', 'cancel_review', 'late_cancelled'));

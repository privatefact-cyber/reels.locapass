-- エリアフォトの通知(いいね・フォローされたとき)の種別を許可する。(2026-10-14)
alter table public.locapass_notifications drop constraint if exists locapass_notifications_type_check;
alter table public.locapass_notifications add constraint locapass_notifications_type_check
  check (type = any (array['new_cast','new_event','new_shop_reel','new_cast_reel','shop_message','admin_message','staff_dm','photo_like','photo_follow']));

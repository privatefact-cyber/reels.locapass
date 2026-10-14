-- エリアフォトの通知(いいね・フォローされたとき)をプッシュ通知で受け取るかの設定。既定はオン。(2026-10-14)
alter table public.locapass_notification_preferences
  add column if not exists photo_like boolean not null default true,
  add column if not exists photo_follow boolean not null default true;

-- スタッフDMの新着反映を、開いている間ずっとポーリングする方式(4秒間隔のSELECT)から
-- Supabase Realtimeのpush配信に切り替える。大規模になるとポーリングは同時に開いている
-- スレッド数に比例してDB負荷・課金が跳ね上がるため、他機能(modella_connectのchat等)と
-- 同じくRealtimeのpostgres_changesを使う。RLSはそのまま効くので、権限のない変更は届かない。
alter publication supabase_realtime add table public.locapass_staff_dm_messages;

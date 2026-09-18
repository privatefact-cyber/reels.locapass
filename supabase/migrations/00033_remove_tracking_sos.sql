-- 動態管理・SOS機能(00011, 00013)の全撤去。
--
-- キャストの安全監視は専用プロダクト「Modella Eye」側に一本化する方針としたため、
-- reel-portalに無料で同梱していたこの簡易実装は廃止する。
--
-- 廃止理由:
--   - field_tokenはanonへexecute許可した公開RPC(submit_cast_location等)の
--     認証情報を兼ねる設計だが、有効期限も再発行手段もなく、漏洩時に
--     なりすまし送信・偽SOSを無期限に許してしまう
--   - GPS送信間隔の制御がクライアント側の自己申告(8秒)のみでサーバー側の
--     間引きが無く、書き込み量・Realtime負荷が青天井になり得る
--   - cast_locations/staff_locations/sos_eventsをsupabase_realtime
--     publicationに含めていたため、ダッシュボードを開くたびにRealtime
--     サブスクリプションが発生し、共有DBインスタンス全体の負荷要因になっていた
--   - 実際の利用実績もほぼ無い(最終更新から1ヶ月以上経過)

alter publication supabase_realtime drop table public.cast_locations;
alter publication supabase_realtime drop table public.sos_events;
alter publication supabase_realtime drop table public.staff_locations;

drop function if exists public.resolve_sos(uuid);
drop function if exists public.set_cast_duty(uuid, boolean);
drop function if exists public.submit_cast_sos(uuid, double precision, double precision);
drop function if exists public.submit_cast_location(uuid, double precision, double precision, double precision);

drop trigger if exists trg_cast_members_create_field_token on public.cast_members;
drop function if exists public.create_cast_field_token();

drop table if exists public.cast_field_tokens;
drop table if exists public.sos_events;
drop table if exists public.staff_locations;
drop table if exists public.cast_location_pings;
drop table if exists public.cast_locations;

alter table public.cast_members drop column if exists is_demo;

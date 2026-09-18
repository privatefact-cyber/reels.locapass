-- 00002_harden_function_privileges と同じ理由: このプロジェクトはデフォルト権限で
-- 新規関数にanon/authenticated双方へ自動でEXECUTEを付与するため、
-- 「revoke all from public」だけではanonへの直接付与分が剥がれない。
--
-- resolve_sos はSOS対応の完了操作(自店舗staffのみが行うべき)であり、
-- anonから呼べる状態は意図しない権限昇格になるため明示的に剥がす。
revoke execute on function public.resolve_sos(uuid) from anon;

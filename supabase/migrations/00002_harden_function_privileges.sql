-- Supabase の advisor(security lint)で検出された過剰な実行権限を締める。
--
-- Supabase はデフォルトで新規関数作成時に anon/authenticated への直接 EXECUTE 権限、
-- もしくは PUBLIC への EXECUTE 権限を自動付与する。
-- 「revoke ... from public」だけでは anon/authenticated への直接付与分は取り消せないため、
-- 各ロールを明示して revoke する必要がある。

-- set_updated_at: search_path を固定(呼び出し元スキーマに応じた挙動のブレを防ぐ)。
-- トリガー専用関数であり、直接のRPC実行は誰にも許可しない。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.set_updated_at() from anon;
revoke execute on function public.set_updated_at() from authenticated;

-- current_shop_ids / is_platform_admin:
-- 呼び出した本人自身に関する情報しか返さないため実害はないが、
-- 公開APIとして叩かせる意図はないため authenticated 限定にする(anonからは不可)。
revoke all on function public.current_shop_ids() from public;
revoke execute on function public.current_shop_ids() from anon;
grant execute on function public.current_shop_ids() to authenticated;

revoke all on function public.is_platform_admin() from public;
revoke execute on function public.is_platform_admin() from anon;
grant execute on function public.is_platform_admin() to authenticated;

-- log_blacklist_change: トリガー専用関数。RPC経由で直接呼び出す用途は一切ないため誰にも実行権を与えない。
revoke all on function public.log_blacklist_change() from public;
revoke execute on function public.log_blacklist_change() from anon;
revoke execute on function public.log_blacklist_change() from authenticated;

-- check_identifier_risk: authenticated(加盟店)専用の照会APIであり、anonからは一切呼べない。
revoke all on function public.check_identifier_risk(text, text) from public;
revoke execute on function public.check_identifier_risk(text, text) from anon;
grant execute on function public.check_identifier_risk(text, text) to authenticated;

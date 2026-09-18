-- LINEログイン連携(app/api/auth/line/callback)専用のヘルパー関数。
-- LINE側で許可されたメールアドレスが既存のSupabaseアカウント(Google/メール等で
-- 先に登録済み)と一致した場合、新規ユーザー作成(email_exists衝突)ではなく
-- 既存アカウントにline_identitiesを紐付けるために、auth.usersをメールで引く。
-- auth.usersはPostgRESTに公開されたスキーマではないため、service_role経由の
-- RPCとしてのみ提供する(anon/authenticatedからは実行不可にする)。
create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from auth.users where email = p_email limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public;
revoke execute on function public.get_user_id_by_email(text) from anon, authenticated;

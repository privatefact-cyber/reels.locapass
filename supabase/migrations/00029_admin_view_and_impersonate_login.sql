-- 【運営者が発行済みログインの認証情報を確認・そのまま店舗管理画面に入れるようにする】
-- 平文パスワードをDBに保存するのはセキュリティ上避けたいため、
-- 「ボタンを押すたびにパスワードを再発行して見せる」方式にする。
-- (運営者は元々全店舗のパスワードを任意に変更できる立場なので、
-- 都度リセットで確認できれば「確認できない」という運用上の不便は解消しつつ、
-- 平文を保存し続けるリスクを避けられる)
--
-- 管理コンソールの「この店舗としてログイン」ボタンも、このRPCで得た新パスワードを使って
-- その場でsignInWithPasswordする実装にする(サービスロールキーが環境に無いための代替策)。
create or replace function public.admin_reset_shop_login_password(
  p_shop_staff_id uuid,
  p_password text default null
)
returns table(login_email text, new_password text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_email text;
  v_password text;
  v_encrypted text;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select user_id, login_email into v_user_id, v_email
  from public.shop_staff where id = p_shop_staff_id;

  if v_user_id is null then
    raise exception 'login not found';
  end if;

  v_password := nullif(trim(coalesce(p_password, '')), '');
  if v_password is null then
    v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  elsif length(v_password) < 6 then
    raise exception 'パスワードは6文字以上にしてください';
  end if;

  v_encrypted := crypt(v_password, gen_salt('bf'));

  update auth.users set encrypted_password = v_encrypted, updated_at = now() where id = v_user_id;

  return query select v_email, v_password;
end;
$$;

revoke all on function public.admin_reset_shop_login_password(uuid, text) from public;
revoke execute on function public.admin_reset_shop_login_password(uuid, text) from anon;
grant execute on function public.admin_reset_shop_login_password(uuid, text) to authenticated;

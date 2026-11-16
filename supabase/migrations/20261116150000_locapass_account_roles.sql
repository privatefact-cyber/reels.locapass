-- ロカわんの「アカウント削除」用。会員(auth.users)が、LOCAPASS・LUXELA・見守りSOS・Modella などで
-- 「役割」(店舗管理者・運営者・キャスト・スタッフ・契約者など)を持っているかを調べる。読み取り専用。
-- 役割が1つでもある会員は、アカウントごと消すと権限や請求・契約の記録が壊れる(削除が拒否されるテーブルもある)ため、
-- ロカわんのデータだけを消す。役割が無い一般会員は、アカウントごと完全に削除する。
-- サーバー(service_role)からだけ呼べる。結果は、見つかった役割の名前の配列(空なら一般会員)。
create or replace function public.locapass_account_roles(p_user uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r text[] := '{}';
begin
  if exists (select 1 from public.locapass_shop_admins where user_id = p_user) then r := array_append(r, 'locapass_shop_admin'); end if;
  if exists (select 1 from public.locapass_portal_admins where user_id = p_user) then r := array_append(r, 'locapass_portal_admin'); end if;
  if exists (select 1 from public.locapass_super_admins where user_id = p_user) then r := array_append(r, 'locapass_super_admin'); end if;
  if exists (select 1 from public.locapass_cast_members where user_id = p_user) then r := array_append(r, 'locapass_cast'); end if;
  if exists (select 1 from public.locapass_shop_staff_members where user_id = p_user) then r := array_append(r, 'locapass_staff'); end if;
  if exists (select 1 from public.locapass_journal_editors where user_id = p_user) then r := array_append(r, 'locapass_journal_editor'); end if;
  if exists (select 1 from public.locapass_fee_invoices where paid_by = p_user) then r := array_append(r, 'locapass_invoice'); end if;
  if exists (select 1 from public.locapass_payout_batches where created_by = p_user) then r := array_append(r, 'locapass_payout'); end if;
  if exists (select 1 from public.locapass_shop_contracts where agreed_by = p_user) then r := array_append(r, 'locapass_contract'); end if;
  if exists (select 1 from public.luxela_journal_editors where user_id = p_user) then r := array_append(r, 'luxela_journal_editor'); end if;
  if exists (select 1 from public.platform_admins where user_id = p_user) then r := array_append(r, 'platform_admin'); end if;
  if exists (select 1 from public.shop_staff where user_id = p_user) then r := array_append(r, 'luxela_shop_staff'); end if;
  if exists (select 1 from public.shop_staff_members where user_id = p_user) then r := array_append(r, 'luxela_staff_member'); end if;
  if exists (select 1 from public.cast_members where user_id = p_user) then r := array_append(r, 'luxela_cast'); end if;
  if exists (select 1 from public.sos_sessions where user_id = p_user) then r := array_append(r, 'sos_session'); end if;
  if exists (select 1 from public.admin_impersonations where admin_user_id = p_user) then r := array_append(r, 'admin_impersonation'); end if;
  if exists (select 1 from wp_inquiry.customers where auth_user_id = p_user) then r := array_append(r, 'wp_inquiry_customer'); end if;
  if exists (select 1 from modella_connect.accounts where user_id = p_user) then r := array_append(r, 'modella_connect_account'); end if;
  if exists (select 1 from modella_connect.customers where user_id = p_user) then r := array_append(r, 'modella_connect_customer'); end if;
  if exists (select 1 from sos_watch.operators where user_id = p_user) then r := array_append(r, 'sos_watch_operator'); end if;
  if exists (select 1 from sos_watch.subscribers where user_id = p_user) then r := array_append(r, 'sos_watch_subscriber'); end if;
  if exists (select 1 from sos_watch.system_admins where user_id = p_user) then r := array_append(r, 'sos_watch_system_admin'); end if;
  if exists (select 1 from sos_watch.company_owners where user_id = p_user) then r := array_append(r, 'sos_watch_company_owner'); end if;
  if exists (select 1 from motors.shop_staff where user_id = p_user) then r := array_append(r, 'motors_staff'); end if;
  if exists (select 1 from motors.super_admins where user_id = p_user) then r := array_append(r, 'motors_super_admin'); end if;
  if exists (select 1 from dropbite.profiles where user_id = p_user) then r := array_append(r, 'dropbite_profile'); end if;
  return r;
end;
$$;

revoke all on function public.locapass_account_roles(uuid) from public, anon, authenticated;
grant execute on function public.locapass_account_roles(uuid) to service_role;

comment on function public.locapass_account_roles(uuid) is
  'ロカわんのアカウント削除用: 会員が他サービスで役割(管理者・キャスト・契約者など)を持つか。空配列なら一般会員。service_role専用。';

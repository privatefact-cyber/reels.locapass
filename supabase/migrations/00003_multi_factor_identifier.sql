-- 電話番号のみでの一致判定は以下の理由で誤判定を招くため、
-- 電話番号・氏名・生年月日の3項目をそれぞれハッシュ化して保持し、
-- 「2項目以上が一致した場合のみ該当あり」とする方式に変更する。
--
-- 1) 電話番号は契約解除後に別人へ再割当されることがあり、電話番号だけで
--    一致判定すると無関係な新しい契約者を誤って登録者として扱ってしまう
--    (電話番号だけ一致 → 該当なし、とする必要がある)。
-- 2) 悪質なトラブルを起こす人物ほど複数回線を頻繁に変える傾向があり、
--    電話番号だけでは同一人物として捕捉できない
--    (氏名+生年月日が一致すれば電話番号が変わっていても該当ありにできる必要がある)。
--
-- 現時点で blacklists / blacklist_audit_log は0件のため、単純にカラムを
-- 置き換える(データ移行は考慮しない)。

-- ---- blacklists ----
alter table public.blacklists
  add column phone_hash text,
  add column name_hash text,
  add column dob_hash text;

alter table public.blacklists
  alter column phone_hash set not null,
  alter column name_hash set not null,
  alter column dob_hash set not null;

alter table public.blacklists drop column identifier_hash;

drop index if exists idx_blacklists_identifier_hash;
create index idx_blacklists_phone_hash on public.blacklists (phone_hash);
create index idx_blacklists_name_hash on public.blacklists (name_hash);
create index idx_blacklists_dob_hash on public.blacklists (dob_hash);

-- ---- blacklist_audit_log ----
alter table public.blacklist_audit_log
  add column phone_hash text,
  add column name_hash text,
  add column dob_hash text;

alter table public.blacklist_audit_log
  alter column phone_hash set not null,
  alter column name_hash set not null,
  alter column dob_hash set not null;

alter table public.blacklist_audit_log drop column identifier_hash;

drop index if exists idx_blacklist_audit_log_identifier_hash;
create index idx_blacklist_audit_log_phone_hash on public.blacklist_audit_log (phone_hash);

-- ---- 監査ログトリガーの更新 ----
create or replace function public.log_blacklist_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_type text;
  v_actor_id uuid;
begin
  if auth.uid() is null then
    v_actor_type := 'system';
    v_actor_id := null;
  elsif public.is_platform_admin() then
    v_actor_type := 'platform_admin';
    v_actor_id := auth.uid();
  else
    v_actor_type := 'shop';
    select shop_id into v_actor_id
    from public.shop_staff
    where user_id = auth.uid()
    limit 1;
  end if;

  if tg_op = 'INSERT' then
    insert into public.blacklist_audit_log (
      blacklist_id, action, actor_type, actor_id, phone_hash, name_hash, dob_hash, target_type,
      new_risk_level, new_status, reason_category, registered_by_shop_id
    ) values (
      new.id, 'insert', v_actor_type, v_actor_id, new.phone_hash, new.name_hash, new.dob_hash, new.target_type,
      new.risk_level, new.status, new.reason_category, new.registered_by_shop_id
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.blacklist_audit_log (
      blacklist_id, action, actor_type, actor_id, phone_hash, name_hash, dob_hash, target_type,
      old_risk_level, new_risk_level, old_status, new_status, reason_category, registered_by_shop_id
    ) values (
      new.id, 'update', v_actor_type, v_actor_id, new.phone_hash, new.name_hash, new.dob_hash, new.target_type,
      old.risk_level, new.risk_level, old.status, new.status, new.reason_category, new.registered_by_shop_id
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.blacklist_audit_log (
      blacklist_id, action, actor_type, actor_id, phone_hash, name_hash, dob_hash, target_type,
      old_risk_level, old_status, reason_category, registered_by_shop_id
    ) values (
      old.id, 'delete', v_actor_type, v_actor_id, old.phone_hash, old.name_hash, old.dob_hash, old.target_type,
      old.risk_level, old.status, old.reason_category, old.registered_by_shop_id
    );
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.log_blacklist_change() from public;
revoke execute on function public.log_blacklist_change() from anon;
revoke execute on function public.log_blacklist_change() from authenticated;

-- ---- 与信照会 RPC の置き換え ----
-- 電話番号・氏名・生年月日のうち2項目以上が一致した行のみを「該当」として扱う。
-- 1項目のみの一致(電話番号だけ、氏名だけ等)は該当なし扱いにする。
drop function if exists public.check_identifier_risk(text, text);

create or replace function public.check_person_risk(
  p_phone_hash text,
  p_name_hash text,
  p_dob_hash text,
  p_target_type text default 'customer'
)
returns table (is_flagged boolean, max_risk_level integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    count(*) > 0 as is_flagged,
    max(risk_level) as max_risk_level
  from public.blacklists
  where target_type = p_target_type
    and status = 'active'
    and (
      (case when phone_hash = p_phone_hash then 1 else 0 end) +
      (case when name_hash = p_name_hash then 1 else 0 end) +
      (case when dob_hash = p_dob_hash then 1 else 0 end)
    ) >= 2;
$$;

revoke all on function public.check_person_risk(text, text, text, text) from public;
revoke execute on function public.check_person_risk(text, text, text, text) from anon;
grant execute on function public.check_person_risk(text, text, text, text) to authenticated;

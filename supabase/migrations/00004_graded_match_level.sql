-- ID書類番号は現場で記録されていない(コピー保管はあるが番号は転記していない)ため
-- 照合キーとして使わない方針に変更。電話番号・氏名・生年月日の3項目に戻し、
-- 「2項目一致 = 該当あり(flagged)」「1項目一致 = 注意(caution)」の段階式にする。
--
-- 顧客側は電話番号以外を取得しないケースが多い(偽名前提)ため、name_hash/dob_hash は
-- customer では任意とする。cast は氏名・生年月日を必ず記録する運用のため必須のままにする。

alter table public.blacklists
  alter column name_hash drop not null,
  alter column dob_hash drop not null;

alter table public.blacklists
  add constraint blacklists_cast_requires_name_dob
  check (
    target_type = 'customer'
    or (name_hash is not null and dob_hash is not null)
  );

alter table public.blacklist_audit_log
  alter column name_hash drop not null,
  alter column dob_hash drop not null;

-- 与信照会 RPC: 該当なし/注意/該当ありの3段階を返すよう変更。
-- NULL同士の一致(双方が氏名未取得等)はカウントしない。
drop function if exists public.check_person_risk(text, text, text, text);

create or replace function public.check_person_risk(
  p_phone_hash text,
  p_name_hash text,
  p_dob_hash text,
  p_target_type text default 'customer'
)
returns table (match_level text, max_risk_level integer)
language sql
security definer
stable
set search_path = public
as $$
  with matches as (
    select
      risk_level,
      (
        (case when phone_hash is not null and p_phone_hash is not null and phone_hash = p_phone_hash then 1 else 0 end) +
        (case when name_hash is not null and p_name_hash is not null and name_hash = p_name_hash then 1 else 0 end) +
        (case when dob_hash is not null and p_dob_hash is not null and dob_hash = p_dob_hash then 1 else 0 end)
      ) as match_count
    from public.blacklists
    where target_type = p_target_type
      and status = 'active'
  )
  select
    case
      when max(match_count) filter (where match_count >= 2) is not null then 'flagged'
      when max(match_count) filter (where match_count = 1) is not null then 'caution'
      else 'none'
    end as match_level,
    coalesce(
      max(risk_level) filter (where match_count >= 2),
      max(risk_level) filter (where match_count = 1)
    ) as max_risk_level
  from matches;
$$;

revoke all on function public.check_person_risk(text, text, text, text) from public;
revoke execute on function public.check_person_risk(text, text, text, text) from anon;
grant execute on function public.check_person_risk(text, text, text, text) to authenticated;

-- 応募者管理(採用DB)。店舗ごとに完全に非公開(cast_membersと同じ shop_id 単位のRLS)。
-- 入力項目は多岐にわたる想定のため、まずは最小限のカラムのみ。
-- 実装しながら随時カラムを追加していく前提の暫定テーブル。
create table public.applicants (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  phone text not null,
  dob date,
  status text not null default 'applied' check (status in ('applied', 'hired', 'rejected')),
  -- 応募登録時に check_person_risk を叩いた結果のスナップショット(参考情報)。
  -- blacklists側の状況は変わりうるので、必要なら再チェックする前提。
  last_check_match_level text,
  last_check_hit_count integer,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_applicants_shop_id on public.applicants (shop_id);

create trigger trg_applicants_set_updated_at
  before update on public.applicants
  for each row
  execute function public.set_updated_at();

alter table public.applicants enable row level security;

create policy "authenticated full access own applicants"
  on public.applicants for all
  to authenticated
  using (shop_id in (select public.current_shop_ids()))
  with check (shop_id in (select public.current_shop_ids()));

-- check_person_risk: 「該当店舗数」の目安として hit_count を追加で返す。
-- 詳細(理由・登録店舗)は今まで通り一切返さない。
drop function if exists public.check_person_risk(text, text, text, text);

create or replace function public.check_person_risk(
  p_phone_hash text,
  p_name_hash text,
  p_dob_hash text,
  p_target_type text default 'customer'
)
returns table (match_level text, max_risk_level integer, hit_count integer)
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
      when count(*) filter (where match_count >= 2) > 0 then 'flagged'
      when count(*) filter (where match_count = 1) > 0 then 'caution'
      else 'none'
    end as match_level,
    coalesce(
      max(risk_level) filter (where match_count >= 2),
      max(risk_level) filter (where match_count = 1)
    ) as max_risk_level,
    case
      when count(*) filter (where match_count >= 2) > 0
        then (count(*) filter (where match_count >= 2))::integer
      when count(*) filter (where match_count = 1) > 0
        then (count(*) filter (where match_count = 1))::integer
      else 0
    end as hit_count
  from matches;
$$;

revoke all on function public.check_person_risk(text, text, text, text) from public;
revoke execute on function public.check_person_risk(text, text, text, text) from anon;
grant execute on function public.check_person_risk(text, text, text, text) to authenticated;

-- スタッフの公開URLにも、キャスト(00104)と同じ「店舗slug+発行番号」方式を持たせる。
-- カウンタはキャストと共有せず別列にする(同じ店舗でキャストとスタッフの発行番号が
-- 重複しても実害はないが、紛らわしさを避けるため独立させる)。

alter table public.locapass_shops
  add column if not exists next_staff_no integer not null default 1;

alter table public.locapass_shop_staff_members
  add column if not exists issue_no integer;

with numbered as (
  select id, row_number() over (partition by shop_id order by created_at, id) as rn
  from public.locapass_shop_staff_members
)
update public.locapass_shop_staff_members m
set issue_no = numbered.rn
from numbered
where numbered.id = m.id;

update public.locapass_shops s
set next_staff_no = coalesce(
  (select max(m.issue_no) + 1 from public.locapass_shop_staff_members m where m.shop_id = s.id),
  1
);

alter table public.locapass_shop_staff_members alter column issue_no set not null;
alter table public.locapass_shop_staff_members
  add constraint locapass_shop_staff_members_shop_issue_no_key unique (shop_id, issue_no);

alter table public.locapass_shop_staff_members alter column issue_no set default 0;

create or replace function public.locapass_staff_assign_issue_no()
returns trigger
language plpgsql
as $$
declare
  v_no int;
begin
  update public.locapass_shops
  set next_staff_no = next_staff_no + 1
  where id = new.shop_id
  returning next_staff_no - 1 into v_no;

  if v_no is null then
    raise exception 'shop_id % が見つかりません', new.shop_id;
  end if;

  new.issue_no := v_no;
  return new;
end;
$$;

drop trigger if exists trg_locapass_staff_assign_issue_no on public.locapass_shop_staff_members;
create trigger trg_locapass_staff_assign_issue_no
  before insert on public.locapass_shop_staff_members
  for each row execute function public.locapass_staff_assign_issue_no();

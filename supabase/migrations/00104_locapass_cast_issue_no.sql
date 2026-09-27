-- キャストの公開URLをUUID直リンクからslugベースに切り替えるための準備。
-- slug文字列そのものは保存せず、「店舗slug + 発行番号」を都度組み立てる方式にする
-- (店舗slugが将来変わった場合も自動追従させたいため)。
--
-- 発行番号は店舗ごとの連番で、欠番(退店・削除)があっても再利用しない。
-- locapass_shops.next_cast_noを「次に払い出す番号」として保持し、
-- キャスト登録時にUPDATE ... RETURNINGで払い出す(行ロックにより同時登録でも重複しない)。

alter table public.locapass_shops
  add column if not exists next_cast_no integer not null default 1;

alter table public.locapass_cast_members
  add column if not exists issue_no integer;

-- 既存キャストへ、店舗ごとにcreated_at順で1から番号を振る。
with numbered as (
  select id, row_number() over (partition by shop_id order by created_at, id) as rn
  from public.locapass_cast_members
)
update public.locapass_cast_members c
set issue_no = numbered.rn
from numbered
where numbered.id = c.id;

update public.locapass_shops s
set next_cast_no = coalesce(
  (select max(c.issue_no) + 1 from public.locapass_cast_members c where c.shop_id = s.id),
  1
);

alter table public.locapass_cast_members alter column issue_no set not null;
alter table public.locapass_cast_members
  add constraint locapass_cast_members_shop_issue_no_key unique (shop_id, issue_no);

-- issue_noはアプリ側から指定させず常にトリガーで上書きする。列にダミーのdefaultを
-- 持たせておくことで、生成される挿入用TypeScript型でissue_noが必須項目にならない。
alter table public.locapass_cast_members alter column issue_no set default 0;

create or replace function public.locapass_cast_assign_issue_no()
returns trigger
language plpgsql
as $$
declare
  v_no int;
begin
  update public.locapass_shops
  set next_cast_no = next_cast_no + 1
  where id = new.shop_id
  returning next_cast_no - 1 into v_no;

  if v_no is null then
    raise exception 'shop_id % が見つかりません', new.shop_id;
  end if;

  new.issue_no := v_no;
  return new;
end;
$$;

drop trigger if exists trg_locapass_cast_assign_issue_no on public.locapass_cast_members;
create trigger trg_locapass_cast_assign_issue_no
  before insert on public.locapass_cast_members
  for each row execute function public.locapass_cast_assign_issue_no();

-- 公開ビューにissue_noを追加(slug組み立てに必要)。
create or replace view public.locapass_public_casts as
  select c.id, c.shop_id, c.name, c.age, c.sizes, c.pr_text, c.avatar_url, c.cast_code, c.created_at, c.updated_at, c.issue_no
  from public.locapass_cast_members c
  join public.locapass_shops s on s.id = c.shop_id
  where s.status = 'active';

grant select on public.locapass_public_casts to anon, authenticated;

-- 新しく取り込んだ店(ロカパス本体=portal_id 55)を、住所から子ポータルへ自動で振り分ける。
-- 振り分けルールは表 locapass_portal_address_rules(住所の正規表現 → ポータル)。子ポータルが増えたら、行を足すだけでよい。
-- 動くとき: 新規登録 / 住所が空から入ったとき(その店がまだロカパス本体にいる場合だけ)。
-- 動かない: ビューティー・ペットの店(専用ポータルがあるため)/ 既に子ポータルにいる店 / 住所が空の店 /
--           行き先に同じ slug の店が既にあるとき(重複を避け、ロカパス本体に残す)。
-- 店舗が後から移動させた(または運営が手で戻した)店は、住所が変わらない限り、動かさない。
create table if not exists public.locapass_portal_address_rules (
  id serial primary key,
  address_pattern text not null,
  portal_id bigint not null references public.locapass_portals(id) on delete cascade,
  sort_order int not null default 100
);
alter table public.locapass_portal_address_rules enable row level security;
-- ポリシーなし = アプリからは読めない(関数は security definer で読む)。

insert into public.locapass_portal_address_rules (address_pattern, portal_id, sort_order)
select v.p, v.pid, v.o from (values ('渋谷区', 407, 10), ('水戸市', 1, 20), ('大洗町', 2, 30), ('横浜市', 399, 40)) as v(p, pid, o)
where not exists (select 1 from public.locapass_portal_address_rules r where r.address_pattern = v.p);

create or replace function public.locapass_auto_route_portal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tgt bigint;
  grand constant bigint := 55;
begin
  if new.portal_id is distinct from grand then
    return new;
  end if;
  if coalesce(new.address, '') = '' or new.business_type = 'beauty' or new.business_type = 'pet' or coalesce(new.category, '') = 'ペット' then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.address, '') <> '' then
    return new;
  end if;

  select r.portal_id into tgt
  from public.locapass_portal_address_rules r
  join public.locapass_portals p on p.id = r.portal_id and p.status = 'active'
  where new.address ~ r.address_pattern
  order by r.sort_order, r.id
  limit 1;
  if tgt is null then
    return new;
  end if;
  if exists (select 1 from public.locapass_shops x where x.portal_id = tgt and x.slug = new.slug and x.id is distinct from new.id) then
    return new;
  end if;
  new.portal_id := tgt;
  return new;
end;
$$;

drop trigger if exists locapass_shops_auto_route_portal on public.locapass_shops;
create trigger locapass_shops_auto_route_portal
  before insert or update of address on public.locapass_shops
  for each row execute function public.locapass_auto_route_portal();

-- 住所が後から入って店が移ったとき、その店のリール・写真も新しいポータルへ揃える。
create or replace function public.locapass_auto_route_portal_followup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.portal_id is distinct from old.portal_id then
    update public.locapass_reels set portal_id = new.portal_id where shop_id = new.id;
    update public.locapass_ugc_photos set portal_id = new.portal_id where shop_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists locapass_shops_auto_route_portal_followup on public.locapass_shops;
create trigger locapass_shops_auto_route_portal_followup
  after update of portal_id on public.locapass_shops
  for each row execute function public.locapass_auto_route_portal_followup();

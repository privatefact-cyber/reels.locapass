-- 掲載料のプラン(定額メニュー)・WEB上の契約(同意の記録)・期間割引・月次の請求行・代理店の手数料。
-- 方針:
--  * 価格は「プラン表」だけで決める(店舗ごとの個別価格は持たない)。値引きは「期間割引(プロモ)」で表す。
--  * お金は動かさない。ここにあるのは記録と計算だけ(決済APIは未接続)。入金の確認は運営が手で押す。
--  * 代理店の手数料は、運営の売上(入金額)から計算する「運営の支払い」。お客様のお金を分配する仕組みではない。
--  * 既存の locapass_shops.plan(文字列)はそのまま使い続ける。契約が有効になったとき、この列を更新する。
-- 運営(super_admin)専用の表: 代理店・手数料・振込のまとまり。店舗管理者が読めるのは、自店の契約と請求行だけ。

-- ============ 1. プラン表 ============
create table if not exists public.locapass_plans (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]{0,31}$'),
  name        text not null,
  monthly_fee integer not null default 0 check (monthly_fee >= 0),
  description text,
  is_public   boolean not null default false,  -- 店舗管理画面の「プランを選ぶ」に出すか
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 既存の plan の値(free / standard)を、価格未設定(0円・非公開)で入れておく。金額は運営が管理画面で決める。
insert into public.locapass_plans (code, name, monthly_fee, is_public, sort_order)
values ('free', 'フリー', 0, true, 0), ('standard', 'スタンダード', 0, false, 10)
on conflict (code) do nothing;

-- ============ 2. 契約書(規約)の版 ============
create table if not exists public.locapass_contract_terms (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  published_at timestamptz,               -- NULL = 下書き(店舗には見せない)
  created_at   timestamptz not null default now()
);

-- ============ 3. 期間割引(キャッシュバック相当。入金額を減らす値引きとして扱う) ============
create table if not exists public.locapass_plan_promos (
  id        uuid primary key default gen_random_uuid(),
  plan_code text not null references public.locapass_plans(code),
  name      text not null,
  kind      text not null check (kind in ('percent', 'amount')),
  value     integer not null check (value > 0),              -- percent: 1〜100 / amount: 1回あたりの円
  months    integer not null check (months between 1 and 36), -- 契約開始から何か月間
  starts_on date,                                              -- この日から契約した店舗が対象(NULL=制限なし)
  ends_on   date,                                              -- この日までに契約した店舗が対象
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);

-- ============ 4. 店舗の契約(同意の記録。金額と割引は契約時点の値を写して持つ) ============
create table if not exists public.locapass_shop_contracts (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.locapass_shops(id) on delete cascade,
  plan_code    text not null references public.locapass_plans(code),
  monthly_fee  integer not null check (monthly_fee >= 0),
  promo_id     uuid references public.locapass_plan_promos(id),
  promo_kind   text check (promo_kind in ('percent', 'amount')),
  promo_value  integer,
  promo_months integer,
  terms_id     uuid references public.locapass_contract_terms(id),
  status       text not null default 'active' check (status in ('active', 'ended')),
  agreed_by    uuid references auth.users(id),
  agreed_at    timestamptz not null default now(),
  started_on   date not null default (now() at time zone 'Asia/Tokyo')::date,
  ended_on     date,
  created_at   timestamptz not null default now()
);
-- 1店舗につき、有効な契約は1つだけ
create unique index if not exists locapass_shop_contracts_one_active
  on public.locapass_shop_contracts(shop_id) where status = 'active';
create index if not exists locapass_shop_contracts_shop on public.locapass_shop_contracts(shop_id);

-- ============ 5. 月次の請求行(入金の確認は運営が手で押す) ============
create table if not exists public.locapass_fee_invoices (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references public.locapass_shop_contracts(id),
  shop_id       uuid not null references public.locapass_shops(id) on delete cascade,
  month         date not null check (extract(day from month) = 1),
  list_amount   integer not null check (list_amount >= 0),   -- プランの定価
  discount      integer not null default 0 check (discount >= 0),
  amount        integer not null check (amount >= 0),         -- 請求額 = 定価 - 割引
  status        text not null default 'due' check (status in ('due', 'paid', 'void')),
  paid_at       timestamptz,
  paid_by       uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (contract_id, month),
  check (amount = list_amount - discount)
);
create index if not exists locapass_fee_invoices_shop on public.locapass_fee_invoices(shop_id, month desc);

-- ============ 6. 代理店 ============
create table if not exists public.locapass_agencies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  -- corporate=法人の代理店 / sole_proprietor=個人事業主の代理店 / referrer=案件を紹介しただけの個人(消費税のかからない収入として扱う)
  kind               text not null check (kind in ('corporate', 'sole_proprietor', 'referrer')),
  invoice_no         text check (invoice_no is null or invoice_no ~ '^T[0-9]{13}$'),
  default_rate       numeric(5,2) not null default 0 check (default_rate between 0 and 100),
  withholding_rate   numeric(6,3) not null default 0 check (withholding_rate between 0 and 100), -- 源泉徴収(個人のとき、税理士に確認して設定)
  bank_code          text check (bank_code is null or bank_code ~ '^[0-9]{4}$'),
  bank_name          text,
  branch_code        text check (branch_code is null or branch_code ~ '^[0-9]{3}$'),
  branch_name        text,
  account_type       text check (account_type is null or account_type in ('普通', '当座')),
  account_no         text check (account_no is null or account_no ~ '^[0-9]{1,8}$'),
  account_holder_kana text,
  email              text,
  notes              text,
  -- インボイス未登録の事業者(corporate / sole_proprietor)には、運営が消費税を差し引けない分を、手数料から引いて払う(契約で事前に合意しておくこと)
  deduct_invoice_gap boolean not null default true,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

-- 代理店 × 店舗(紹介関係)。料率が NULL なら、代理店の標準料率を使う。永久継続(ended_on を入れるまで)。
create table if not exists public.locapass_agency_shops (
  id        uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.locapass_agencies(id),
  shop_id   uuid not null references public.locapass_shops(id) on delete cascade,
  rate      numeric(5,2) check (rate is null or rate between 0 and 100),
  starts_on date not null default (now() at time zone 'Asia/Tokyo')::date,
  ended_on  date,
  created_at timestamptz not null default now()
);
-- 1店舗の紹介元は同時に1つだけ
create unique index if not exists locapass_agency_shops_one_active
  on public.locapass_agency_shops(shop_id) where ended_on is null;

-- ============ 7. 手数料(入金を確認した時点の値で固定) と 振込のまとまり ============
create table if not exists public.locapass_payout_batches (
  id            uuid primary key default gen_random_uuid(),
  transfer_date date not null,
  total_gross   integer not null default 0,
  total_withholding integer not null default 0,
  total_tax_adjustment integer not null default 0,
  total_net     integer not null default 0,
  note          text,
  paid_at       timestamptz,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create table if not exists public.locapass_commissions (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.locapass_agencies(id),
  shop_id     uuid not null references public.locapass_shops(id) on delete cascade,
  invoice_id  uuid not null unique references public.locapass_fee_invoices(id),
  month       date not null,
  base_amount integer not null check (base_amount >= 0),   -- 入金額(割引後)
  rate        numeric(5,2) not null,
  commission  integer not null check (commission >= 0),    -- floor(入金額 × 料率)
  withholding integer not null default 0 check (withholding >= 0),
  tax_adjustment integer not null default 0 check (tax_adjustment >= 0), -- インボイス未登録の事業者に負担してもらう、消費税の差し引けない分
  status      text not null default 'pending' check (status in ('pending', 'batched', 'paid', 'void')),
  batch_id    uuid references public.locapass_payout_batches(id),
  created_at  timestamptz not null default now()
);
create index if not exists locapass_commissions_agency on public.locapass_commissions(agency_id, status);

-- ============ RLS ============
alter table public.locapass_plans            enable row level security;
alter table public.locapass_contract_terms   enable row level security;
alter table public.locapass_plan_promos      enable row level security;
alter table public.locapass_shop_contracts   enable row level security;
alter table public.locapass_fee_invoices     enable row level security;
alter table public.locapass_agencies         enable row level security;
alter table public.locapass_agency_shops     enable row level security;
alter table public.locapass_payout_batches   enable row level security;
alter table public.locapass_commissions      enable row level security;

-- 運営は全部
do $$
declare t text;
begin
  foreach t in array array['locapass_plans','locapass_contract_terms','locapass_plan_promos','locapass_shop_contracts',
                           'locapass_fee_invoices','locapass_agencies','locapass_agency_shops','locapass_payout_batches','locapass_commissions']
  loop
    execute format('create policy "super admin all" on public.%I for all to authenticated using (public.locapass_is_super_admin()) with check (public.locapass_is_super_admin())', t);
  end loop;
end $$;

-- 公開してよいプラン・公開済みの規約・有効な割引は、ログイン済みの人(店舗管理者)が読める
create policy "read public plans" on public.locapass_plans for select to anon, authenticated using (is_public);
create policy "read published terms" on public.locapass_contract_terms for select to authenticated using (published_at is not null);
create policy "read active promos" on public.locapass_plan_promos for select to authenticated
  using (is_active and exists (select 1 from public.locapass_plans p where p.code = plan_code and p.is_public));

-- 店舗管理者は、自店の契約と請求行だけ読める(書き込みは下の関数だけ)
create policy "shop admin read own contracts" on public.locapass_shop_contracts for select to authenticated
  using (public.locapass_is_shop_admin(shop_id));
create policy "shop admin read own invoices" on public.locapass_fee_invoices for select to authenticated
  using (public.locapass_is_shop_admin(shop_id));

-- ============ 関数 ============

-- 契約する(WEBで同意)。店舗管理者(またはエリア管理者・運営)が呼べる。価格はプラン表の値で固定。割引は、有効なプロモのうち指定されたものだけ。
create or replace function public.locapass_agree_contract(p_shop_id uuid, p_plan_code text, p_terms_id uuid, p_promo_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_plan public.locapass_plans;
  v_promo public.locapass_plan_promos;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_id uuid;
begin
  if auth.uid() is null or not public.locapass_is_shop_admin(p_shop_id) then
    raise exception '権限がありません';
  end if;
  select * into v_plan from public.locapass_plans where code = p_plan_code;
  if not found or (not v_plan.is_public and not public.locapass_is_super_admin()) then
    raise exception 'このプランは選べません';
  end if;
  if not exists (select 1 from public.locapass_contract_terms where id = p_terms_id and published_at is not null) then
    raise exception '規約が見つかりません';
  end if;
  if p_promo_id is not null then
    select * into v_promo from public.locapass_plan_promos
     where id = p_promo_id and plan_code = p_plan_code and is_active
       and (starts_on is null or starts_on <= v_today) and (ends_on is null or ends_on >= v_today);
    if not found then raise exception 'この割引は使えません'; end if;
  end if;

  update public.locapass_shop_contracts set status = 'ended', ended_on = v_today
   where shop_id = p_shop_id and status = 'active';

  insert into public.locapass_shop_contracts
    (shop_id, plan_code, monthly_fee, promo_id, promo_kind, promo_value, promo_months, terms_id, agreed_by, started_on)
  values
    (p_shop_id, p_plan_code, v_plan.monthly_fee, v_promo.id, v_promo.kind, v_promo.value, v_promo.months, p_terms_id, auth.uid(), v_today)
  returning id into v_id;

  update public.locapass_shops set plan = p_plan_code where id = p_shop_id;
  return v_id;
end $$;

-- 割引額: 契約開始の月から数えて promo_months か月目まで。percentは切り捨て、定価を超えない。
create or replace function public.locapass_promo_discount(c public.locapass_shop_contracts, p_month date)
returns integer
language sql immutable
as $$
  select case
    when c.promo_kind is null or c.promo_months is null then 0
    when ((extract(year from p_month) - extract(year from c.started_on)) * 12
          + (extract(month from p_month) - extract(month from c.started_on))) >= c.promo_months then 0
    when c.promo_kind = 'percent' then least(c.monthly_fee, floor(c.monthly_fee * c.promo_value / 100.0)::int)
    else least(c.monthly_fee, c.promo_value)
  end
$$;

-- 月次の請求行を作る(運営)。有効な契約で、定価が0円のものは作らない。すでにある行は何もしない。
create or replace function public.locapass_generate_invoices(p_month date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_n integer;
begin
  if not public.locapass_is_super_admin() then raise exception '権限がありません'; end if;
  insert into public.locapass_fee_invoices (contract_id, shop_id, month, list_amount, discount, amount)
  select c.id, c.shop_id, v_month, c.monthly_fee, d.disc, c.monthly_fee - d.disc
    from public.locapass_shop_contracts c
    cross join lateral (select public.locapass_promo_discount(c, v_month) as disc) d
   where c.status = 'active' and c.monthly_fee > 0
     and date_trunc('month', c.started_on)::date <= v_month
  on conflict (contract_id, month) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 入金を確認した(運営)。同じ処理の中で、紹介元の代理店がいれば手数料を確定する。2回押しても二重にならない。
create or replace function public.locapass_confirm_invoice_paid(p_invoice_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  i public.locapass_fee_invoices;
  l public.locapass_agency_shops;
  a public.locapass_agencies;
  v_rate numeric(5,2);
  v_comm integer;
  v_adj integer := 0;
  v_loss numeric;
begin
  if not public.locapass_is_super_admin() then raise exception '権限がありません'; end if;
  select * into i from public.locapass_fee_invoices where id = p_invoice_id for update;
  if not found then raise exception '請求行が見つかりません'; end if;
  if i.status = 'paid' then return; end if;
  if i.status = 'void' then raise exception '取り消し済みの請求行です'; end if;

  update public.locapass_fee_invoices set status = 'paid', paid_at = now(), paid_by = auth.uid() where id = i.id;

  select * into l from public.locapass_agency_shops
   where shop_id = i.shop_id and starts_on <= i.month + interval '1 month' - interval '1 day'
     and (ended_on is null or ended_on >= i.month)
   order by starts_on desc limit 1;
  if found then
    select * into a from public.locapass_agencies where id = l.agency_id and is_active;
    if found and i.amount > 0 then
      v_rate := coalesce(l.rate, a.default_rate);
      v_comm := floor(i.amount * v_rate / 100.0)::int;
      if v_comm > 0 then
        -- 未登録の事業者に払う手数料は税込の総額なので、そのうち運営が差し引けない消費税の分を、手数料から引く。
        -- 差し引けない割合(経過措置): 2026-09まで20% / 2029-09まで50% / それ以降100%。紹介者(referrer)は消費税のかからない収入なので対象外。
        if a.kind in ('corporate', 'sole_proprietor') and a.invoice_no is null and a.deduct_invoice_gap then
          v_loss := case when i.month < date '2026-10-01' then 0.2 when i.month < date '2029-10-01' then 0.5 else 1.0 end;
          v_adj := floor(v_comm * 10.0 / 110.0 * v_loss)::int;
        end if;
        insert into public.locapass_commissions (agency_id, shop_id, invoice_id, month, base_amount, rate, commission, withholding, tax_adjustment)
        values (a.id, i.shop_id, i.id, i.month, i.amount, v_rate, v_comm, floor(v_comm * a.withholding_rate / 100.0)::int, v_adj)
        on conflict (invoice_id) do nothing;
      end if;
    end if;
  end if;
end $$;

-- 請求行を取り消す(運営)。手数料がまだ振込のまとまりに入っていなければ、手数料も取り消す。
create or replace function public.locapass_void_invoice(p_invoice_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.locapass_is_super_admin() then raise exception '権限がありません'; end if;
  if exists (select 1 from public.locapass_commissions where invoice_id = p_invoice_id and status in ('batched', 'paid')) then
    raise exception '手数料がすでに振込の手配に入っているため、取り消せません';
  end if;
  update public.locapass_commissions set status = 'void' where invoice_id = p_invoice_id and status = 'pending';
  update public.locapass_fee_invoices set status = 'void' where id = p_invoice_id;
end $$;

-- 振込のまとまりを作る(運営)。口座が登録済みの代理店の「確定済み・未払い」の手数料を全部入れる。口座未登録の代理店は保留のまま。
create or replace function public.locapass_create_payout_batch(p_transfer_date date, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.locapass_is_super_admin() then raise exception '権限がありません'; end if;
  insert into public.locapass_payout_batches (transfer_date, note, created_by) values (p_transfer_date, p_note, auth.uid()) returning id into v_id;

  update public.locapass_commissions c set status = 'batched', batch_id = v_id
   where c.status = 'pending'
     and exists (select 1 from public.locapass_agencies a
                  where a.id = c.agency_id and a.bank_code is not null and a.branch_code is not null
                    and a.account_type is not null and a.account_no is not null and a.account_holder_kana is not null);

  update public.locapass_payout_batches b set
    total_gross = coalesce((select sum(commission) from public.locapass_commissions where batch_id = b.id), 0),
    total_withholding = coalesce((select sum(withholding) from public.locapass_commissions where batch_id = b.id), 0),
    total_tax_adjustment = coalesce((select sum(tax_adjustment) from public.locapass_commissions where batch_id = b.id), 0),
    total_net = coalesce((select sum(commission - withholding - tax_adjustment) from public.locapass_commissions where batch_id = b.id), 0)
   where b.id = v_id;
  return v_id;
end $$;

-- 振込を済ませた印をつける(運営)
create or replace function public.locapass_mark_batch_paid(p_batch_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.locapass_is_super_admin() then raise exception '権限がありません'; end if;
  update public.locapass_commissions set status = 'paid' where batch_id = p_batch_id and status = 'batched';
  update public.locapass_payout_batches set paid_at = now() where id = p_batch_id and paid_at is null;
end $$;

revoke all on function public.locapass_agree_contract(uuid, text, uuid, uuid) from public;
revoke all on function public.locapass_generate_invoices(date) from public;
revoke all on function public.locapass_confirm_invoice_paid(uuid) from public;
revoke all on function public.locapass_void_invoice(uuid) from public;
revoke all on function public.locapass_create_payout_batch(date, text) from public;
revoke all on function public.locapass_mark_batch_paid(uuid) from public;
grant execute on function public.locapass_agree_contract(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.locapass_generate_invoices(date) to authenticated;
grant execute on function public.locapass_confirm_invoice_paid(uuid) to authenticated;
grant execute on function public.locapass_void_invoice(uuid) to authenticated;
grant execute on function public.locapass_create_payout_batch(date, text) to authenticated;
grant execute on function public.locapass_mark_batch_paid(uuid) to authenticated;

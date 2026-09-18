-- Modella: 初期スキーマ
-- 表側(ポータル基本機能) + 裏側(店舗間リスク照会機能)

create extension if not exists "pgcrypto";

-- =========================================================
-- 1. shops
-- =========================================================
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text,
  genre text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 加盟店アカウント(auth.users)と店舗の紐付け。
-- RLSで「自店舗」を判定するために必要(元スキーマにはなかったが必須の補助テーブル)。
create table public.shop_staff (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'staff',
  created_at timestamptz not null default now(),
  unique (shop_id, user_id)
);

create index idx_shop_staff_user_id on public.shop_staff (user_id);

-- 運営者(当社)アカウント。CICでいう信用情報機関そのものの立場にあたり、
-- 本人確認済みの削除請求を受けた際に全店舗分のblacklistsを横断参照して
-- 合理的な判断を下すために、店舗の垣根を越えたアクセス権を持つ。
create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 2. cast_members
-- =========================================================
create table public.cast_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  age integer,
  sizes jsonb, -- { t, b, w, h }
  pr_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_cast_members_shop_id on public.cast_members (shop_id);

-- =========================================================
-- 3. schedules
-- =========================================================
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.cast_members (id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  is_working_today boolean not null default false
);

create index idx_schedules_cast_id_date on public.schedules (cast_id, date);

-- =========================================================
-- 4. media
-- =========================================================
create table public.media (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid references public.cast_members (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  url text not null,
  display_order integer not null default 0
);

create index idx_media_cast_id on public.media (cast_id);
create index idx_media_shop_id on public.media (shop_id);

-- =========================================================
-- 5. blacklists (裏側: 与信/リスク照会)
--
-- 目的: 過去のドタキャン・トラブル等の再発防止のための「該当あり/なし」照会のみ。
-- 他店舗が登録した詳細(理由・店舗名)を閲覧できる必要はないため、
-- このテーブル自体への横断SELECTは許可しない(下記 check_identifier_risk 参照)。
--
-- identifier_hash は生の電話番号等をそのまま保存しない不可逆値だが、
-- 単純ハッシュはレインボーテーブルで逆引きされ得るため、
-- サーバー(Edge Function)側で秘密ペッパーを使った HMAC-SHA256 により生成すること。
-- クライアントJSで計算・送信してはならない。
-- =========================================================
create table public.blacklists (
  id uuid primary key default gen_random_uuid(),
  identifier_hash text not null,
  target_type text not null check (target_type in ('customer', 'cast')),
  risk_level integer not null check (risk_level in (1, 2, 3)), -- 1:要注意 2:拒否/出禁 3:重大トラブル
  reason_category text, -- 'cancel' | 'trouble' | 'fly' 等
  registered_by_shop_id uuid not null references public.shops (id),
  -- status: 'active' の間だけ check_identifier_risk の該当判定に含まれる。
  -- 'resolved' は「一度リストに上がったが状況が改善した」等の履歴として行を残したまま除外する場合に使う。
  -- 登録自体が誤りだった場合は resolved にせず、行ごと DELETE する想定(下記ポリシー参照)。
  status text not null default 'active' check (status in ('active', 'resolved')),
  resolved_at timestamptz,
  resolved_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_blacklists_identifier_hash on public.blacklists (identifier_hash);
create index idx_blacklists_registered_by_shop on public.blacklists (registered_by_shop_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_blacklists_set_updated_at
  before update on public.blacklists
  for each row
  execute function public.set_updated_at();

-- =========================================================
-- 修正ログ(監査ログ)
--
-- blacklists への insert/update/delete を自動的に記録する。行を物理削除しても
-- (「誤登録」ケース)ログ自体は残るよう、blacklist_id に外部キー制約は張らない
-- (張るとDELETE時に参照整合性違反で消せなくなるため)。
--
-- action='ai_review' の行は blacklists の実際の変更ではなく、
-- 削除請求などをAIが評価した「推奨」の記録用(下記 blacklist-review 参照)。
-- 運営者のみ閲覧可能。追記のみで更新・削除ポリシーは意図的に用意しない(改ざん防止)。
-- =========================================================
create table public.blacklist_audit_log (
  id uuid primary key default gen_random_uuid(),
  blacklist_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete', 'ai_review')),
  actor_type text not null check (actor_type in ('shop', 'platform_admin', 'ai', 'system')),
  actor_id uuid,
  identifier_hash text not null,
  target_type text not null,
  old_risk_level integer,
  new_risk_level integer,
  old_status text,
  new_status text,
  reason_category text,
  registered_by_shop_id uuid,
  -- AIが削除請求等を評価した際の推奨・確信度・根拠。あくまで参考情報であり、
  -- blacklists の実際の状態変更は必ず platform_admin による action='update'/'delete' を伴う。
  ai_assessment jsonb,
  created_at timestamptz not null default now()
);

create index idx_blacklist_audit_log_blacklist_id on public.blacklist_audit_log (blacklist_id);
create index idx_blacklist_audit_log_identifier_hash on public.blacklist_audit_log (identifier_hash);

-- ai_review_config テーブル定義は、判定に使う is_platform_admin() 関数の定義後に
-- 配置する必要があるため後方(RLS有効化セクションの直後)に移動している。

-- =========================================================
-- RLS 有効化
-- =========================================================
alter table public.shops enable row level security;
alter table public.shop_staff enable row level security;
alter table public.platform_admins enable row level security;
alter table public.cast_members enable row level security;
alter table public.schedules enable row level security;
alter table public.media enable row level security;
alter table public.blacklists enable row level security;
alter table public.blacklist_audit_log enable row level security;

-- 呼び出しユーザーが所属する店舗id一覧
create or replace function public.current_shop_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select shop_id from public.shop_staff where user_id = auth.uid();
$$;

-- 呼び出しユーザーが運営者(当社)アカウントかどうか
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

-- ---- platform_admins ----
-- 運営者自身が「自分が運営者であるか」を確認できる程度に留める。
-- 一般の店舗アカウントからは参照不可(ポリシー未作成=拒否)。
create policy "platform admin read own row"
  on public.platform_admins for select
  to authenticated
  using (user_id = auth.uid());

-- =========================================================
-- ai_review_config
--
-- 現時点ではAIによる自動判断は行わない(auto_apply_enabled = false 固定)。
-- 将来、判断アルゴリズムの精度検証が済んだ段階で target_type ごとに
-- auto_apply_enabled / min_confidence_threshold を切り替えられるようにするための
-- 設定置き場。切り替えてもテーブル構造の変更は不要な設計にしてある。
-- 実際に「AIが自動実行する」処理自体は未実装(ここは設定の受け皿のみ)。
-- =========================================================
create table public.ai_review_config (
  target_type text primary key check (target_type in ('customer', 'cast')),
  auto_apply_enabled boolean not null default false,
  min_confidence_threshold numeric not null default 0.95 check (min_confidence_threshold between 0 and 1),
  updated_by uuid references public.platform_admins (user_id),
  updated_at timestamptz not null default now()
);

insert into public.ai_review_config (target_type, auto_apply_enabled)
values ('customer', false), ('cast', false);

alter table public.ai_review_config enable row level security;

-- 運営者のみ参照・更新可能。この設定を変えられるのは当社の判断のみとする。
create policy "platform admin read ai review config"
  on public.ai_review_config for select
  to authenticated
  using (public.is_platform_admin());

create policy "platform admin update ai review config"
  on public.ai_review_config for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---- shops ----
create policy "anon read active shops"
  on public.shops for select
  to anon
  using (status = 'active');

create policy "authenticated read active or own shops"
  on public.shops for select
  to authenticated
  using (status = 'active' or id in (select public.current_shop_ids()));

-- ---- shop_staff ----
create policy "authenticated read own staff row"
  on public.shop_staff for select
  to authenticated
  using (user_id = auth.uid());

-- ---- cast_members ----
create policy "anon read cast of active shops"
  on public.cast_members for select
  to anon
  using (exists (
    select 1 from public.shops s where s.id = shop_id and s.status = 'active'
  ));

create policy "authenticated full access own cast"
  on public.cast_members for all
  to authenticated
  using (shop_id in (select public.current_shop_ids()))
  with check (shop_id in (select public.current_shop_ids()));

-- ---- schedules ----
create policy "anon read schedules of active shops"
  on public.schedules for select
  to anon
  using (exists (
    select 1
    from public.cast_members c
    join public.shops s on s.id = c.shop_id
    where c.id = cast_id and s.status = 'active'
  ));

create policy "authenticated full access own schedules"
  on public.schedules for all
  to authenticated
  using (exists (
    select 1 from public.cast_members c
    where c.id = cast_id and c.shop_id in (select public.current_shop_ids())
  ))
  with check (exists (
    select 1 from public.cast_members c
    where c.id = cast_id and c.shop_id in (select public.current_shop_ids())
  ));

-- ---- media ----
create policy "anon read media of active shops"
  on public.media for select
  to anon
  using (exists (
    select 1 from public.shops s where s.id = shop_id and s.status = 'active'
  ));

create policy "authenticated full access own media"
  on public.media for all
  to authenticated
  using (shop_id in (select public.current_shop_ids()))
  with check (shop_id in (select public.current_shop_ids()));

-- ---- blacklists ----
-- anon: ポリシーを一切作成しない = 完全にアクセス不可(SELECT/INSERT/UPDATE/DELETEすべて拒否)。
--
-- authenticated(加盟店)は自店舗が登録した行のみ。
-- platform_admins(運営者/当社)は全店舗の全行にアクセス可能(CICのような
-- 信用情報機関の立場として、本人確認済みの削除請求等を審査するために必要)。

-- 参照: 自店舗の登録分、または運営者は全件。
create policy "read own registered entries or platform admin"
  on public.blacklists for select
  to authenticated
  using (
    registered_by_shop_id in (select public.current_shop_ids())
    or public.is_platform_admin()
  );

-- 新規登録: 自店舗としてのみ、または運営者はどの店舗名義でも登録可能。
create policy "insert as own shop or platform admin"
  on public.blacklists for insert
  to authenticated
  with check (
    registered_by_shop_id in (select public.current_shop_ids())
    or public.is_platform_admin()
  );

-- 削除: 自店舗の登録分のみ、または運営者は全件。
-- 加盟店側の「そもそも登録が誤りだった」場合と、
-- 運営者側の「本人確認済み削除請求を審査のうえ承認した」場合の両方に対応する。
create policy "delete own registered entries or platform admin"
  on public.blacklists for delete
  to authenticated
  using (
    registered_by_shop_id in (select public.current_shop_ids())
    or public.is_platform_admin()
  );

-- 更新: 自店舗の登録分のみ、または運営者は全件。
-- 加盟店側の「状況が改善してリストに載せておく必要がなくなった」場合は
-- status を 'resolved' にして resolved_at / resolved_reason を記録する想定
-- (行は残る=履歴になる)。registered_by_shop_id 自体を他店舗にすり替えることはできない
-- (運営者を除く)。
create policy "update own registered entries or platform admin"
  on public.blacklists for update
  to authenticated
  using (
    registered_by_shop_id in (select public.current_shop_ids())
    or public.is_platform_admin()
  )
  with check (
    registered_by_shop_id in (select public.current_shop_ids())
    or public.is_platform_admin()
  );

-- ---- blacklist_audit_log ----
-- 運営者のみ閲覧可能。ログの改ざん防止のため update/delete ポリシーは用意しない。
create policy "platform admin read audit log"
  on public.blacklist_audit_log for select
  to authenticated
  using (public.is_platform_admin());

-- ai_review(AIによる審査推奨)の記録は運営者のみが書き込める。
-- insert/update/delete の実記録は下記トリガーが SECURITY DEFINER でRLSをバイパスして書き込む。
create policy "platform admin insert ai review log"
  on public.blacklist_audit_log for insert
  to authenticated
  with check (action = 'ai_review' and public.is_platform_admin());

-- blacklists への変更を自動記録するトリガー関数。
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
      blacklist_id, action, actor_type, actor_id, identifier_hash, target_type,
      new_risk_level, new_status, reason_category, registered_by_shop_id
    ) values (
      new.id, 'insert', v_actor_type, v_actor_id, new.identifier_hash, new.target_type,
      new.risk_level, new.status, new.reason_category, new.registered_by_shop_id
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.blacklist_audit_log (
      blacklist_id, action, actor_type, actor_id, identifier_hash, target_type,
      old_risk_level, new_risk_level, old_status, new_status, reason_category, registered_by_shop_id
    ) values (
      new.id, 'update', v_actor_type, v_actor_id, new.identifier_hash, new.target_type,
      old.risk_level, new.risk_level, old.status, new.status, new.reason_category, new.registered_by_shop_id
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.blacklist_audit_log (
      blacklist_id, action, actor_type, actor_id, identifier_hash, target_type,
      old_risk_level, old_status, reason_category, registered_by_shop_id
    ) values (
      old.id, 'delete', v_actor_type, v_actor_id, old.identifier_hash, old.target_type,
      old.risk_level, old.status, old.reason_category, old.registered_by_shop_id
    );
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_blacklists_audit
  after insert or update or delete on public.blacklists
  for each row
  execute function public.log_blacklist_change();

-- =========================================================
-- 与信照会 RPC
--
-- 「該当あり/なし」+ 深刻度のみを返し、理由や登録店舗などの詳細は一切返さない。
-- status = 'resolved'(解決済み)の行は該当なし扱いにする。
-- SECURITY DEFINER により blacklists の行単位RLS(自店舗分のみ)をバイパスして
-- 全店舗分を横断照会するが、戻り値には元データを含めない設計そのものが
-- プライバシー保護の要。
-- =========================================================
create or replace function public.check_identifier_risk(
  p_identifier_hash text,
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
  where identifier_hash = p_identifier_hash
    and target_type = p_target_type
    and status = 'active';
$$;

revoke all on function public.check_identifier_risk(text, text) from public;
grant execute on function public.check_identifier_risk(text, text) to authenticated;

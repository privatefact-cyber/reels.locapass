-- 【運営者による「代理ログイン(なりすまし店舗管理)」】
-- 重要な設計変更: 当初「入るたびにパスワードを再発行する」実装を検討したが、
-- 店長が普段使っているパスワードを勝手に上書きしてしまい、店長がログインできなく
-- なる重大事故につながるためNG(ユーザーからの明確な指摘、2026-08-27)。
--
-- 正しい設計: 店舗のパスワードには一切触れず、運営者は自分自身のセッションのまま
-- 「今どの店舗を代理閲覧しているか」をDB側に保持し、current_shop_ids()にUNIONする。
-- current_shop_ids()はshops/cast_members/reels/shop_price_items等ほぼ全テーブルの
-- RLSポリシーの判定基準として既に使われているため、この1関数を拡張するだけで
-- 個別テーブルのポリシーを1つずつ書き換える必要がない(最小侵襲)。
--
-- 「パスワード再発行」(admin_reset_shop_login_password, 00029)は本件と無関係の
-- 別アクションとして維持する。運営者が明示的にボタンを押した時のみ実行される。

create table public.admin_impersonations (
  admin_user_id uuid primary key references auth.users (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

alter table public.admin_impersonations enable row level security;

create policy "admin manage own impersonation"
  on public.admin_impersonations for all
  to authenticated
  using (admin_user_id = auth.uid() and public.is_platform_admin())
  with check (admin_user_id = auth.uid() and public.is_platform_admin());

-- 既存のcurrent_shop_ids()を拡張。shop_staffベースの判定に加えて、
-- 運営者が代理ログイン中の店舗idもUNIONする。戻り値の型(setof uuid)は変更なし。
create or replace function public.current_shop_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select shop_id from public.shop_staff where user_id = auth.uid()
  union
  select shop_id from public.admin_impersonations
  where admin_user_id = auth.uid() and expires_at > now();
$$;

create or replace function public.admin_start_impersonation(p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if not exists (select 1 from public.shops where id = p_shop_id) then
    raise exception 'shop not found';
  end if;

  insert into public.admin_impersonations (admin_user_id, shop_id, expires_at)
  values (auth.uid(), p_shop_id, now() + interval '2 hours')
  on conflict (admin_user_id)
  do update set shop_id = excluded.shop_id, expires_at = excluded.expires_at, created_at = now();
end;
$$;

revoke all on function public.admin_start_impersonation(uuid) from public;
revoke execute on function public.admin_start_impersonation(uuid) from anon;
grant execute on function public.admin_start_impersonation(uuid) to authenticated;

create or replace function public.admin_stop_impersonation()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.admin_impersonations where admin_user_id = auth.uid();
$$;

revoke all on function public.admin_stop_impersonation() from public;
revoke execute on function public.admin_stop_impersonation() from anon;
grant execute on function public.admin_stop_impersonation() to authenticated;

-- トップページのヒーロー・PICK UP枠に出す店舗と順番。nullなら掲載しない。
-- 掲載は運営判断(提携・掲載許諾の取れた店舗)なので、店舗スタッフが自分で変更できないよう
-- 00072 の guard_shop_privileged_columns に列を追加する。

alter table public.shops add column if not exists featured_rank integer;
create index if not exists shops_featured_rank_idx on public.shops (featured_rank) where featured_rank is not null;

create or replace function public.guard_shop_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (new.plan is distinct from old.plan
      or new.map_video_enabled is distinct from old.map_video_enabled
      or new.featured_rank is distinct from old.featured_rank
      or new.is_sponsored is distinct from old.is_sponsored
      or new.sponsored_rank is distinct from old.sponsored_rank
      or new.is_verified is distinct from old.is_verified)
     and coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not public.is_platform_admin() then
    raise exception 'plan / map_video_enabled / featured / sponsored / verified can only be changed by the platform admin';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_shop_privileged_columns() from public, anon, authenticated;

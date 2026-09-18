-- キャストの日記(ブログ)機能。集客用に表側ポータルで公開する。
create table public.cast_diary_entries (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.cast_members (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  title text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_cast_diary_entries_cast_id on public.cast_diary_entries (cast_id, created_at desc);

create trigger trg_cast_diary_entries_set_updated_at
  before update on public.cast_diary_entries
  for each row
  execute function public.set_updated_at();

alter table public.cast_diary_entries enable row level security;

-- anon: active な店舗のキャストの日記のみ閲覧可能(表側ポータルでの公開用)。
create policy "anon read diary of active shops"
  on public.cast_diary_entries for select
  to anon
  using (exists (
    select 1 from public.shops s where s.id = shop_id and s.status = 'active'
  ));

-- authenticated: 自店舗のキャストの日記のみ全権限。
create policy "authenticated full access own diary"
  on public.cast_diary_entries for all
  to authenticated
  using (shop_id in (select public.current_shop_ids()))
  with check (shop_id in (select public.current_shop_ids()));

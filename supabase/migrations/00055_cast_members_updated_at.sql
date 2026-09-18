-- キャストのProfilePage構造化データ(dateModified)用にupdated_atを追加する。
alter table public.cast_members
  add column updated_at timestamptz not null default now();

create trigger trg_cast_members_set_updated_at
  before update on public.cast_members
  for each row
  execute function public.set_updated_at();

-- 誕生日のお知らせを送った記録(同じ子・同じ年・同じ段階で二重に送らない)。サーバーだけ。
-- stage: '7d'(1週間前) / '1d'(前日) / '0d'(当日)
create table if not exists public.locapass_pet_birthday_log (
  id bigint generated always as identity primary key,
  pet_id uuid not null references public.locapass_pets (id) on delete cascade,
  year int not null,
  stage text not null,
  sent_at timestamptz not null default now(),
  unique (pet_id, year, stage)
);
alter table public.locapass_pet_birthday_log enable row level security;

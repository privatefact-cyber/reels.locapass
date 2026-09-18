-- 公開プロフィールページ(/cast/[castId])のURLがUUIDでインスタのプロフィール欄には
-- 長すぎる(改行される・文字数制限にかかる)という運用上の課題への対応。
-- shop_code(00023_cast_login_links_and_shop_code.sql)と同じ発想で、
-- 短い英数字コードを自動採番し、/c/[code] からリダイレクトできるようにする。

alter table public.cast_members add column cast_code text unique;

create or replace function public.generate_cast_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 紛らわしい 0/O, 1/I を除外(shop_codeと同じ字種)
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.cast_members where cast_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.set_cast_code()
returns trigger
language plpgsql
as $$
begin
  if new.cast_code is null then
    new.cast_code := public.generate_cast_code();
  end if;
  return new;
end;
$$;

create trigger trg_cast_members_set_cast_code
  before insert on public.cast_members
  for each row
  execute function public.set_cast_code();

update public.cast_members set cast_code = public.generate_cast_code() where cast_code is null;

alter table public.cast_members alter column cast_code set not null;

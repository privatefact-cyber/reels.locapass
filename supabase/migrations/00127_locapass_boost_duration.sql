-- ブーストの掲載時間を、店舗が 1/2/3 時間から選べるようにする。(2026-10-15)
alter table public.locapass_boost_posts
  add column if not exists duration_minutes int not null default 60 check (duration_minutes in (60, 120, 180));

create or replace function public.locapass_boost_posts_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    -- 掲載時間は duration_minutes(60/120/180)から決める。クライアントが渡した expires_at は無視する。
    new.expires_at := now() + make_interval(mins => new.duration_minutes);
    new.status := 'active';
    if (select count(*) from public.locapass_boost_posts b
         where b.shop_id = new.shop_id and b.status = 'active' and b.expires_at > now()) >= 3 then
      raise exception 'boost_limit: 同時に掲載できるブーストは3件までです';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.shop_id is distinct from old.shop_id
       or new.title is distinct from old.title or new.description is distinct from old.description
       or new.image_url is distinct from old.image_url or new.discount_tag is distinct from old.discount_tag
       or new.duration_minutes is distinct from old.duration_minutes
       or new.created_at is distinct from old.created_at or new.expires_at is distinct from old.expires_at then
      raise exception 'boost_immutable: ブーストの内容は変更できません(終了のみ可能です)';
    end if;
    if new.status <> 'expired' then
      raise exception 'boost_immutable: 終了以外の変更はできません';
    end if;
  end if;
  return new;
end $$;

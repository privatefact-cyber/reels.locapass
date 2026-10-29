-- 「今日の出店」で先の予定をまとめて登録すると、お気に入りの人へ予定の数だけ「新着イベント」通知が飛んでしまう。
-- 位置つき(出店)イベントのうち、開始が10分より先の予定は通知しない。「営業開始」(いま始まるもの)は従来どおり通知する。
create or replace function public.locapass_notify_new_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_shop_name text;
begin
  if new.lat is not null and new.starts_at is not null and new.starts_at > now() + interval '10 minutes' then
    return new;
  end if;
  select name into v_shop_name from public.locapass_shops where id = new.shop_id;
  insert into public.locapass_notifications (user_id, type, title, body, url, shop_id)
  select f.member_id, 'new_event', coalesce(v_shop_name, 'お気に入り店舗') || 'の新着イベント',
         new.title, '/shops/' || new.shop_id, new.shop_id
  from public.locapass_shop_favorites f where f.shop_id = new.shop_id;
  return new;
end;
$$;

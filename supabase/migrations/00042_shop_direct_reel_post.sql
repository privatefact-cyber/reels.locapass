-- 今まで投稿できるのはキャスト・スタッフのみで、店舗アカウント自身は
-- リール投稿タブから閲覧・削除しかできなかった。店舗自身の投稿も許可する。
-- 店舗が直接投稿したリールは cast_id / posted_by_staff_id をどちらもnullにして表す。

create or replace function public.set_reel_shop_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cast_id is not null then
    select shop_id into new.shop_id from public.cast_members where id = new.cast_id;
  elsif new.posted_by_staff_id is not null then
    select shop_id into new.shop_id from public.shop_staff_members where id = new.posted_by_staff_id;
  end if;
  -- 店舗自身の投稿(両方null)はクライアント指定のshop_idをそのまま使う。
  -- 下のRLS(shop insert own reels)がcurrent_shop_ids()に含まれるかを検証するので、
  -- ここでは上書きしない。
  return new;
end;
$$;

create policy "shop insert own reels"
  on public.reels for insert
  to authenticated
  with check (
    cast_id is null
    and posted_by_staff_id is null
    and shop_id in (select public.current_shop_ids())
  );

create policy "shop upload own reel media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'reels'
    and exists (
      select 1 from public.current_shop_ids() sid
      where sid::text = (storage.foldername(name))[1]
    )
  );

create policy "shop delete own reel media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'reels'
    and exists (
      select 1 from public.current_shop_ids() sid
      where sid::text = (storage.foldername(name))[1]
    )
  );

-- イベント告知を「単日(event_date)」から「開始日時(starts_at)〜終了日時(ends_at)」の
-- 期間指定に変更する。終了日時を過ぎたイベントをポータル表示から外す判定は
-- アプリ側のクエリ(ends_at < now() を除外/バッジ表示)で行うため、ここではデータ構造のみ。
alter table public.shop_events
  add column starts_at timestamptz,
  add column ends_at timestamptz,
  add column gallery_image_urls text[] not null default '{}';

-- 既存データの event_date (日付のみ) を starts_at (JST 0時) に引き継ぐ。
update public.shop_events
  set starts_at = (event_date::text || 'T00:00:00+09:00')::timestamptz
  where event_date is not null;

alter table public.shop_events
  drop column event_date;

alter table public.shop_events
  add constraint shop_events_ends_after_starts
  check (ends_at is null or starts_at is null or ends_at >= starts_at);

-- サムネイル(image_url・必須)とは別に、イベント詳細ページ用の追加画像(任意・複数)を
-- 実ファイルアップロードできるようにするストレージバケット。
-- 「店舗スタッフ(current_shop_ids())が自店舗フォルダに書き込む」設計は cast-media(00018) と同じ形。
insert into storage.buckets (id, name, public)
values ('shop-events', 'shop-events', true)
on conflict (id) do nothing;

create policy "public read shop event media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'shop-events');

create policy "shop upload own event media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'shop-events'
    and exists (
      select 1 from public.current_shop_ids() sid
      where sid::text = (storage.foldername(name))[1]
    )
  );

create policy "shop delete own event media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'shop-events'
    and exists (
      select 1 from public.current_shop_ids() sid
      where sid::text = (storage.foldername(name))[1]
    )
  );

-- キャストのストーリー(reel_type='story' かつ cast_id あり)は、本家と同じくフォロワーだけが見られる。
-- 店舗(キャスト以外)のリール・ストーリーの公開範囲は従来どおり。
alter policy "public read published locapass_reels" on public.locapass_reels
  using (
    status = 'publish'
    and (expires_at is null or expires_at > now())
    and (shop_id is null or exists (select 1 from public.locapass_shops s where s.id = locapass_reels.shop_id and s.status = 'active'))
    and not (reel_type = 'story' and cast_id is not null)
  );
create policy "followers read active cast stories" on public.locapass_reels for select to authenticated
  using (
    status = 'publish' and reel_type = 'story' and cast_id is not null and expires_at > now()
    and exists (select 1 from public.locapass_shops s where s.id = locapass_reels.shop_id and s.status = 'active')
    and exists (select 1 from public.locapass_cast_follows f where f.user_id = auth.uid() and f.cast_id = locapass_reels.cast_id)
  );

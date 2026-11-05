-- 初回テーブル作成済み環境に、サーバー専用クライアントの明示ポリシーを追加する。
create policy "service role manages youtube ingestions"
  on public.locapass_youtube_ingestions
  for all to service_role
  using (true)
  with check (true);



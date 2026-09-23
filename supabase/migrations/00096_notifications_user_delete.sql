-- 通知を本人が削除できるようにする(左スワイプ/ゴミ箱ボタン)。自分の通知だけ。
create policy "user delete own notifications"
  on public.notifications for delete to authenticated
  using (user_id = auth.uid());

create policy "user delete own notifications"
  on public.locapass_notifications for delete to authenticated
  using (user_id = auth.uid());

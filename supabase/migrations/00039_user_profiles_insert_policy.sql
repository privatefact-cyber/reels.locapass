-- user_profilesはhandle_new_user()トリガー(新規サインアップ時)でしか行を作らない設計だったが、
-- 00037より前に作成された既存auth.usersアカウント(cast/staff/管理者等)には行が無いままで、
-- そのユーザーが一般ユーザー導線でログインした場合にUPDATEが対象0件のまま静かに失敗する
-- (RLS配下のUPDATE/DELETEはヒット0件でもエラーにならないSupabaseの既知の挙動)。
-- マイページ側をupdateからupsertに変更し、その受け皿としてINSERTポリシーを追加する。

create policy "user insert own profile"
  on public.user_profiles for insert
  to authenticated
  with check (id = auth.uid());

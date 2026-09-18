-- 「公開ページのanon向けポリシーに対応するauthenticated向けポリシーが
-- 無い/狭い」を見つけるためのレビュー用クエリ。
--
-- 背景: 「anon read Xの active shops」のようなポリシーを、authenticated
-- ロールへの付与を忘れてanon限定のまま書いてしまうミスが複数テーブルで
-- 発生した(00034, 00035で修正)。ログイン中のユーザーが他店舗の公開ページを
-- 見ると0件→404になる、という形で症状が出る。
--
-- 新しいテーブル・ポリシーを追加した後は、このクエリをSupabase SQL Editor
-- (またはMCPのexecute_sql)で実行し、"anon_only_policy"に出てきたテーブルについて
-- "same_table_authenticated_policies"を見て、authenticated向けにも同等の
-- 閲覧範囲(例: status='active'など)が用意されているか目視で確認すること。
-- 無ければ以下のように追加する:
--
--   alter policy "<policy名>" on public.<table名> to anon, authenticated;

select
  p.tablename,
  p.policyname as anon_only_policy,
  p.qual as anon_only_using_clause,
  (
    select coalesce(jsonb_agg(jsonb_build_object('policyname', p2.policyname, 'roles', p2.roles, 'using', p2.qual)), '[]'::jsonb)
    from pg_policies p2
    where p2.schemaname = 'public'
      and p2.tablename = p.tablename
      and p2.cmd in ('SELECT', 'ALL')
      and p2.roles @> array['authenticated']::name[]
  ) as same_table_authenticated_policies
from pg_policies p
where p.schemaname = 'public'
  and p.cmd in ('SELECT', 'ALL')
  and p.roles = '{anon}'
order by p.tablename;

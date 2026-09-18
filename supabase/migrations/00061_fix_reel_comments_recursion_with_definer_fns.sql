-- 00060では相関ミス(c.reel_id = c.reel_id のトートロジー)だけを直したが、それでも
-- 「infinite recursion detected in policy」は解消しなかった。根本原因は相関の誤りではなく、
-- reel_commentsのINSERT用WITH CHECKの中で「同じreel_commentsテーブル」をサブクエリで
-- 読みに行っていること自体。そのサブクエリにもreel_commentsのSELECTポリシーが適用され、
-- INSERT対象行のポリシー評価とSELECTポリシー評価がPostgres内部で循環し無限再帰になる。
--
-- 対処: 同じテーブルを覗く「既にコメント済みか」「既に返信済みか」「親コメントが自分の
-- リールの客コメントか」の3つのチェックをSECURITY DEFINER関数に切り出す。SECURITY DEFINER
-- 関数は所有者(RLSの対象外であるテーブル所有者)権限で実行されるため、内部のSELECTでRLSを
-- 再評価せずに済み、循環が切れる。

create or replace function public.customer_has_commented_on_reel(p_reel_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reel_comments c
    where c.reel_id = p_reel_id and c.author_type = 'customer' and c.user_id = p_user_id
  );
$$;

revoke all on function public.customer_has_commented_on_reel(uuid, uuid) from public;
grant execute on function public.customer_has_commented_on_reel(uuid, uuid) to authenticated;

create or replace function public.cast_has_replied_to_comment(p_parent_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reel_comments reply
    where reply.parent_comment_id = p_parent_comment_id and reply.author_type = 'cast'
  );
$$;

revoke all on function public.cast_has_replied_to_comment(uuid) from public;
grant execute on function public.cast_has_replied_to_comment(uuid) to authenticated;

create or replace function public.is_own_reel_customer_comment(p_comment_id uuid, p_reel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reel_comments parent
    join public.reels r on r.id = parent.reel_id
    where parent.id = p_comment_id
      and parent.reel_id = p_reel_id
      and parent.author_type = 'customer'
      and r.cast_id = public.current_cast_id()
      and r.is_comments_enabled = true
  );
$$;

revoke all on function public.is_own_reel_customer_comment(uuid, uuid) from public;
grant execute on function public.is_own_reel_customer_comment(uuid, uuid) to authenticated;

drop policy "authenticated customer add one comment per reel" on public.reel_comments;

create policy "authenticated customer add one comment per reel"
  on public.reel_comments for insert
  to authenticated
  with check (
    author_type = 'customer'
    and parent_comment_id is null
    and not exists (select 1 from public.banned_users where user_id = auth.uid())
    and exists (
      select 1 from public.reels r
      join public.shops s on s.id = r.shop_id
      where r.id = reel_comments.reel_id
        and r.status = 'published'
        and s.status = 'active'
        and r.is_comments_enabled = true
    )
    and not public.customer_has_commented_on_reel(reel_comments.reel_id, auth.uid())
  );

drop policy "cast reply once per comment on own reel" on public.reel_comments;

create policy "cast reply once per comment on own reel"
  on public.reel_comments for insert
  to authenticated
  with check (
    author_type = 'cast'
    and cast_id = public.current_cast_id()
    and parent_comment_id is not null
    and public.is_own_reel_customer_comment(reel_comments.parent_comment_id, reel_comments.reel_id)
    and not public.cast_has_replied_to_comment(reel_comments.parent_comment_id)
  );

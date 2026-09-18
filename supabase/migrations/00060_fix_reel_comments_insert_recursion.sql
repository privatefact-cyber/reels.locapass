-- reel_commentsへのコメント投稿が「infinite recursion detected in policy」で
-- 常に失敗していたバグを修正する。
--
-- 原因: WITH CHECK内のサブクエリで、挿入しようとしている新規行の列を参照するつもりで
-- 書いた `reel_id` / `parent_comment_id` が、サブクエリ側のエイリアス(c / reply / parent)の
-- 同名列に束縛されてしまい、`c.reel_id = c.reel_id` のような常に真のトートロジーになっていた。
-- 相関が外れたことで実質「reel_commentsテーブル全体」に対する無相関EXISTSになり、
-- それを評価するために自分自身のSELECTポリシーを再帰的に辿ろうとして無限再帰エラーになる。
-- 修正はテーブル名で明示的に修飾し(reel_comments.reel_id 等)、新規行を指すことを明確にする。

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
    and not exists (
      select 1 from public.reel_comments c
      where c.reel_id = reel_comments.reel_id
        and c.author_type = 'customer'
        and c.user_id = auth.uid()
    )
  );

drop policy "cast reply once per comment on own reel" on public.reel_comments;

create policy "cast reply once per comment on own reel"
  on public.reel_comments for insert
  to authenticated
  with check (
    author_type = 'cast'
    and cast_id = public.current_cast_id()
    and parent_comment_id is not null
    and exists (
      select 1
      from public.reel_comments parent
      join public.reels r on r.id = parent.reel_id
      where parent.id = reel_comments.parent_comment_id
        and parent.reel_id = reel_comments.reel_id
        and parent.author_type = 'customer'
        and r.cast_id = public.current_cast_id()
        and r.is_comments_enabled = true
    )
    and not exists (
      select 1 from public.reel_comments reply
      where reply.parent_comment_id = reel_comments.parent_comment_id
        and reply.author_type = 'cast'
    )
  );

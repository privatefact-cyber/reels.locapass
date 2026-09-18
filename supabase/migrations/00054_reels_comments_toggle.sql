-- リール投稿ごとに「コメント受付」のON/OFFを切り替えられるようにする。
alter table public.reels
  add column is_comments_enabled boolean not null default true;

-- 客の新規コメント・キャストの返信、どちらもOFFのリールには書き込めないようにRLS側でも防御する。
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
      where r.id = reel_id and r.status = 'published' and s.status = 'active' and r.is_comments_enabled = true
    )
    and not exists (
      select 1 from public.reel_comments c
      where c.reel_id = reel_id
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
      where parent.id = parent_comment_id
        and parent.reel_id = reel_id
        and parent.author_type = 'customer'
        and r.cast_id = public.current_cast_id()
        and r.is_comments_enabled = true
    )
    and not exists (
      select 1 from public.reel_comments reply
      where reply.parent_comment_id = parent_comment_id
        and reply.author_type = 'cast'
    )
  );

-- reel_comments: キャスト本人が返信できるようにし、「客ごとに1往復・15文字以内」に制限する。
-- (このテーブルは投稿UI自体がこれまで存在せず、実データは0件のため後方互換は考慮しない)

alter table public.reel_comments
  add column parent_comment_id uuid references public.reel_comments (id) on delete cascade,
  add column cast_id uuid references public.cast_members (id) on delete set null;

create index idx_reel_comments_parent_comment_id on public.reel_comments (parent_comment_id);
create index idx_reel_comments_cast_id on public.reel_comments (cast_id) where cast_id is not null;

alter table public.reel_comments drop constraint reel_comments_author_type_check;
alter table public.reel_comments add constraint reel_comments_author_type_check
  check (author_type in ('customer', 'staff', 'cast'));

alter table public.reel_comments drop constraint reel_comments_author_shape;
alter table public.reel_comments add constraint reel_comments_author_shape check (
  (author_type = 'customer' and user_id is not null and staff_member_id is null and cast_id is null and parent_comment_id is null)
  or (author_type = 'staff' and staff_member_id is not null and viewer_id is null and cast_id is null)
  or (author_type = 'cast' and cast_id is not null and viewer_id is null and staff_member_id is null and parent_comment_id is not null)
);

alter table public.reel_comments add constraint reel_comments_body_length check (char_length(body) between 1 and 15);

-- 未ログインの客が投稿できていた既存ポリシーを廃止し、ログイン済みの客のみ・
-- リールごとに1人1コメントまでに絞る。
drop policy "anyone add customer comment" on public.reel_comments;

create policy "authenticated customer add one comment per reel"
  on public.reel_comments for insert
  to authenticated
  with check (
    author_type = 'customer'
    and parent_comment_id is null
    and exists (
      select 1 from public.reels r
      join public.shops s on s.id = r.shop_id
      where r.id = reel_id and r.status = 'published' and s.status = 'active'
    )
    and not exists (
      select 1 from public.reel_comments c
      where c.reel_id = reel_id
        and c.author_type = 'customer'
        and c.user_id = auth.uid()
    )
  );

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
    )
    and not exists (
      select 1 from public.reel_comments reply
      where reply.parent_comment_id = parent_comment_id
        and reply.author_type = 'cast'
    )
  );

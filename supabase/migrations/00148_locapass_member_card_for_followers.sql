-- フォロー通知から相手のプロフィールへ飛べるようにする。
-- 相手のページ(/photo/u/<id>)は「写真を投稿した会員」にしか存在せず、投稿のない人からのフォロー通知は
-- 自分のページに飛ばしていた。DMの相手を探せないので、投稿がなくても「関係のある相手」には
-- 名前とアイコンだけ見られるようにする(全会員を公開にはしない)。
--
-- 見られる条件(ブロックし合っていない場合のみ):
--   ・相手が写真を投稿している(従来どおり公開)
--   ・相手が自分をフォローしている / 自分が相手をフォローしている
--   ・自分と相手のDMスレッドがある
create or replace function public.locapass_member_card(p_member_id uuid)
returns table (nickname text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select coalesce(m.nickname, 'ゲスト'), m.avatar_url
  from locapass_members m
  where m.id = p_member_id
    and auth.uid() is not null
    and not public.locapass_is_blocked_between(auth.uid(), p_member_id)
    and (
      exists (select 1 from area_photo_posts p where p.member_id = p_member_id)
      or public.locapass_is_following(p_member_id, auth.uid())
      or public.locapass_is_following(auth.uid(), p_member_id)
      or exists (
        select 1 from locapass_staff_dm_threads t
        where (t.user_id = auth.uid() and t.peer_user_id = p_member_id)
           or (t.user_id = p_member_id and t.peer_user_id = auth.uid())
      )
    );
$$;
revoke all on function public.locapass_member_card(uuid) from public, anon;
grant execute on function public.locapass_member_card(uuid) to authenticated;

-- 既存のフォロー通知のリンク先を、フォローした人のページ(by=)に直す。
update public.locapass_notifications
set url = '/photo/u/' || substring(url from 'by=([0-9a-f-]{36})') || '?by=' || substring(url from 'by=([0-9a-f-]{36})')
where type = 'photo_follow' and url ~ 'by=[0-9a-f-]{36}';

-- マイページの「フォロー中」に、フォローしている会員(キャスト以外)も出すための一覧。
create or replace function public.locapass_my_following_members()
returns table (user_id uuid, nickname text, avatar_url text)
language sql stable security definer set search_path = public as $$
  with f as (
    select followee_member_id as uid, created_at from area_photo_follows where follower_member_id = auth.uid()
    union all
    select followee_id, created_at from locapass_user_follows where follower_id = auth.uid()
  )
  select f.uid, coalesce(m.nickname, 'ゲスト'), m.avatar_url
  from f left join locapass_members m on m.id = f.uid
  where auth.uid() is not null and not public.locapass_is_blocked_between(auth.uid(), f.uid)
  group by f.uid, m.nickname, m.avatar_url
  order by max(f.created_at) desc;
$$;
revoke all on function public.locapass_my_following_members() from public, anon;
grant execute on function public.locapass_my_following_members() to authenticated;

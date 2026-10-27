-- DMのフォロー案内(locapass_dm_follow)やフォロワー一覧のフォローバック(locapass_follow_back)で
-- フォローしても、相手に「フォローされました」の通知が入らなかった(写真投稿者ページのフォローボタンだけが通知していた)。
-- フォローの共通処理 locapass_apply_follow で、相手に通知を1件入れる(同じ人からの通知は重複させない)。
-- 通知の飛び先は、フォローした人のプロフィール(/photo/u/<フォローした人>)。
-- プッシュは DBトリガーが廃止済みのURLを呼ぶため、push_dispatched_at を入れて二重送信/空振りを避ける
-- (アプリ側の notifyPhotoFollow と同じ扱い。一覧にだけ入る)。

create or replace function public.locapass_apply_follow(p_target uuid, p_follow boolean, p_cast_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_url text;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  if p_target is null or p_target = auth.uid() then raise exception 'フォローできません'; end if;

  if p_follow then
    if public.locapass_is_blocked_between(auth.uid(), p_target) then
      raise exception 'フォローできません';
    end if;
    if p_cast_id is not null then
      insert into locapass_cast_follows (user_id, cast_id) values (auth.uid(), p_cast_id) on conflict do nothing;
      return;
    elsif exists (select 1 from locapass_shop_staff_members where user_id = p_target)
       or exists (select 1 from locapass_cast_members where user_id = p_target) then
      insert into locapass_user_follows (follower_id, followee_id) values (auth.uid(), p_target) on conflict do nothing;
    else
      insert into area_photo_follows (follower_member_id, followee_member_id)
      select auth.uid(), p_target
      where not exists (
        select 1 from area_photo_follows where follower_member_id = auth.uid() and followee_member_id = p_target
      );
    end if;

    -- 相手に「フォローされました」の通知(同じ人からは1回だけ)。
    select coalesce(nickname, 'ゲスト') into v_name from locapass_members where id = auth.uid();
    v_url := '/photo/u/' || auth.uid() || '?by=' || auth.uid();
    insert into locapass_notifications (user_id, type, title, body, url, push_dispatched_at)
    select p_target, 'photo_follow', coalesce(v_name, 'ゲスト') || 'さんがあなたをフォローしました', null, v_url, now()
    where not exists (
      select 1 from locapass_notifications where user_id = p_target and type = 'photo_follow' and url = v_url
    );
  else
    delete from locapass_user_follows where follower_id = auth.uid() and followee_id = p_target;
    delete from area_photo_follows where follower_member_id = auth.uid() and followee_member_id = p_target;
    delete from locapass_cast_follows f using locapass_cast_members c
      where f.cast_id = c.id and f.user_id = auth.uid() and c.user_id = p_target;
  end if;
end;
$$;
revoke all on function public.locapass_apply_follow(uuid, boolean, uuid) from public, anon, authenticated;

-- 今日(2026-10-27 UTC)のテストで、通知が入らなかった会員同士のフォローを補う。
insert into public.locapass_notifications (user_id, type, title, body, url, push_dispatched_at)
select f.followee_member_id, 'photo_follow',
       coalesce(m.nickname, 'ゲスト') || 'さんがあなたをフォローしました', null,
       '/photo/u/' || f.follower_member_id || '?by=' || f.follower_member_id, now()
from public.area_photo_follows f
left join public.locapass_members m on m.id = f.follower_member_id
where f.created_at >= '2026-10-27'
  and not exists (
    select 1 from public.locapass_notifications n
    where n.user_id = f.followee_member_id and n.type = 'photo_follow'
      and n.url = '/photo/u/' || f.follower_member_id || '?by=' || f.follower_member_id
  );

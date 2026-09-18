-- キャストが「リール(ポータル全体に公開)」か「ストーリー(フォロワー限定・24時間で
-- 自動的に見えなくなる)」かを選んで投稿できるようにする。インスタのストーリーと同じ思想。
-- 実際の削除(物理削除)はしない。expires_atを過ぎたら各ポリシー・RPCが対象から外すだけ
-- (後片付けはバッチ等で別途行う想定)。
alter table public.reels
  add column post_type text not null default 'reel' check (post_type in ('reel', 'story'));
alter table public.reels
  add column expires_at timestamptz;

create index reels_active_stories_idx on public.reels (cast_id, expires_at)
  where post_type = 'story';

-- ストーリー投稿時、expires_atをクライアントに委ねず作成時刻+24時間をDB側で確定させる
-- (クライアントの時計のズレやなりすましを気にしなくてよいように)。
create or replace function public.set_reel_story_expiry()
returns trigger
language plpgsql
as $$
begin
  if new.post_type = 'story' and new.expires_at is null then
    new.expires_at := new.created_at + interval '24 hours';
  end if;
  return new;
end;
$$;

create trigger trg_reels_set_story_expiry
  before insert on public.reels
  for each row
  execute function public.set_reel_story_expiry();

-- 既存の「誰でも読める」ポリシーはリール(post_type='reel')限定に絞り、
-- ストーリーは別ポリシーで「本人」「フォロワー」だけに開放する。
drop policy "anon read published reels of active shops" on public.reels;

create policy "anon read published reels of active shops"
  on public.reels for select
  to anon, authenticated
  using (
    status = 'published'
    and post_type = 'reel'
    and exists (select 1 from public.shops s where s.id = shop_id and s.status = 'active')
  );

-- キャスト本人は自分の投稿(リール/ストーリー問わず、期限切れ後も)を常に見える。
-- マイページでの自分のストーリー管理・削除に必要。
create policy "cast read own reels"
  on public.reels for select
  to authenticated
  using (cast_id = public.current_cast_id());

-- フォロー中キャストの、期限内のストーリーだけ閲覧可能。
create policy "followers read active stories"
  on public.reels for select
  to authenticated
  using (
    status = 'published'
    and post_type = 'story'
    and expires_at > now()
    and exists (select 1 from public.shops s where s.id = shop_id and s.status = 'active')
    and exists (
      select 1 from public.user_cast_follows f
      where f.user_id = auth.uid() and f.cast_id = reels.cast_id
    )
  );

-- 「このキャストは今アクティブなストーリーを持っているか」だけを、本文を一切見せずに
-- 判定するためのRPC。丸型サムネイル(リング)の出し分けに使う。フォローしていない
-- 一般ユーザーやanonでも「ストーリーがある/ない」自体は分かってよい前提
-- (Instagramの未フォロー相手のストーリーリングと同じ)。
create or replace function public.cast_ids_with_active_story(p_cast_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct cast_id
  from public.reels
  where cast_id = any(p_cast_ids)
    and post_type = 'story'
    and status = 'published'
    and expires_at > now();
$$;

revoke all on function public.cast_ids_with_active_story(uuid[]) from public;
grant execute on function public.cast_ids_with_active_story(uuid[]) to anon, authenticated;

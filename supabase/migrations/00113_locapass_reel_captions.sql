-- リール動画の多言語テロップ(字幕)。
--   locapass_reel_captions : 言語ごとの字幕(時刻つきの台詞の配列)。ja=元の音声の文字起こし、en/zh=翻訳。
--   locapass_reels.caption_status      : none(未処理) / pending(処理中) / ready / no_speech(声なし) / failed
--   locapass_reels.caption_avoid_zone  : 動画に焼き込み字幕がある位置(none/top/middle/bottom)。テロップを避けて置く。
-- 生成はVercelのAPI(/api/reels/[id]/captions)が投稿者のセッションで書き込む(service roleは使わない)。

alter table public.locapass_reels
  add column if not exists caption_status text
    check (caption_status in ('pending', 'ready', 'no_speech', 'failed')),
  add column if not exists caption_avoid_zone text not null default 'none'
    check (caption_avoid_zone in ('none', 'top', 'middle', 'bottom')),
  add column if not exists captions_generated_at timestamptz;

create table if not exists public.locapass_reel_captions (
  reel_id uuid not null references public.locapass_reels(id) on delete cascade,
  lang text not null check (lang in ('ja', 'en', 'zh')),
  -- [{ "s": 開始秒, "e": 終了秒, "t": "台詞" }]
  cues jsonb not null,
  created_at timestamptz not null default now(),
  primary key (reel_id, lang)
);

alter table public.locapass_reel_captions enable row level security;

grant select on public.locapass_reel_captions to anon, authenticated;
grant insert, update, delete on public.locapass_reel_captions to authenticated;

-- 見られるのは「そのリールが見られる人」だけ(リール側のRLSがそのまま効く)。anon/authenticated両方に付ける(CLAUDE.md)。
create policy "read captions of visible reels" on public.locapass_reel_captions
  for select to anon, authenticated
  using (exists (select 1 from public.locapass_reels r where r.id = reel_id));

-- 書き込みは、そのリールを投稿/管理できる人(本人のキャスト、または店舗のスタッフ/管理者)だけ。
create policy "manage captions of own reels insert" on public.locapass_reel_captions
  for insert to authenticated
  with check (exists (
    select 1 from public.locapass_reels r
    where r.id = reel_id
      and ((r.cast_id is not null and r.cast_id = public.locapass_current_cast_id())
        or (r.shop_id is not null and public.locapass_is_shop_staff(r.shop_id)))
  ));

create policy "manage captions of own reels update" on public.locapass_reel_captions
  for update to authenticated
  using (exists (
    select 1 from public.locapass_reels r
    where r.id = reel_id
      and ((r.cast_id is not null and r.cast_id = public.locapass_current_cast_id())
        or (r.shop_id is not null and public.locapass_is_shop_staff(r.shop_id)))
  ))
  with check (exists (
    select 1 from public.locapass_reels r
    where r.id = reel_id
      and ((r.cast_id is not null and r.cast_id = public.locapass_current_cast_id())
        or (r.shop_id is not null and public.locapass_is_shop_staff(r.shop_id)))
  ));

create policy "manage captions of own reels delete" on public.locapass_reel_captions
  for delete to authenticated
  using (exists (
    select 1 from public.locapass_reels r
    where r.id = reel_id
      and ((r.cast_id is not null and r.cast_id = public.locapass_current_cast_id())
        or (r.shop_id is not null and public.locapass_is_shop_staff(r.shop_id)))
  ));

-- 1日の処理本数の上限(サーキットブレーカー)を数えるための索引。
create index if not exists locapass_reel_captions_created_idx
  on public.locapass_reel_captions (created_at desc) where lang = 'ja';

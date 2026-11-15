-- 店舗AI(有料オプション): その店の登録情報だけで答えるAIコンシェルジュ(LUXELAと同じ仕組み)。
-- ・locapass_shops に、オプションのオン/オフ(ai_chat_enabled)と、AIの顔の設定を足す。
-- ・質問ログ / AIの知識(ファイルを置くだけで読み取った文章) / 改善提案 の表を足す。
--
-- 注意: 既存の表(locapass_shops と locapass_cast_members / locapass_shop_staff_members など)の間に、
-- 外部キーの「2本目のつながり」を作らない。PostgRESTの埋め込みが「どちらか決められない」エラーになるため
-- (2026-11-15にLUXELAで発生)。顔のスタッフIDは外部キーなしの uuid 列にして、サーバー側で存在確認する。
alter table public.locapass_shops add column if not exists ai_chat_enabled boolean not null default false;
-- 顔の種類: none=AIのアイコンだけ / staff=店長などスタッフの写真 / custom=店舗が設定したキャラクターの画像
alter table public.locapass_shops add column if not exists ai_avatar_kind text not null default 'none' check (ai_avatar_kind in ('none', 'staff', 'custom'));
alter table public.locapass_shops add column if not exists ai_avatar_staff_id uuid;
alter table public.locapass_shops add column if not exists ai_avatar_image_url text;
-- 写真に写る本人の承諾を得ていると、店舗が確認したか(staff / custom のとき必須)
alter table public.locapass_shops add column if not exists ai_avatar_consent boolean not null default false;

-- 契約(オン/オフ)は、他のオプションと同じく portal_admin 以上だけが変更できる(店舗は変更不可)。
create or replace function public.locapass_shops_guard_privileged()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null
     and (new.plan is distinct from old.plan
          or new.status is distinct from old.status
          or new.portal_id is distinct from old.portal_id
          or new.map_video_enabled is distinct from old.map_video_enabled
          or new.embed_enabled is distinct from old.embed_enabled
          or new.auto_video_enabled is distinct from old.auto_video_enabled
          or new.ai_chat_enabled is distinct from old.ai_chat_enabled
          or new.sns_whisper is distinct from old.sns_whisper
          or new.sns_whisper_updated_at is distinct from old.sns_whisper_updated_at
          or new.sns_whisper_source is distinct from old.sns_whisper_source
          or new.sns_whisper_checked_at is distinct from old.sns_whisper_checked_at
          or new.sns_whisper_sources is distinct from old.sns_whisper_sources
          or new.is_temporarily_closed is distinct from old.is_temporarily_closed)
     and not locapass_is_portal_admin(old.portal_id) then
    raise exception 'plan/status/portal_id/map_video_enabled/embed_enabled/auto_video_enabled/ai_chat_enabled/sns_whisper/is_temporarily_closed can only be changed by portal admins';
  end if;
  if new.portal_id is distinct from old.portal_id and auth.uid() is not null and not locapass_is_portal_admin(new.portal_id) then
    raise exception 'not an admin of the destination portal';
  end if;
  return new;
end;
$function$;

-- 利用者の質問とAIの答えの記録。書き込みはサーバー(service role)だけ。読めるのは、その店舗の管理者(ポータル管理者以上を含む)だけ。
-- 個人を特定する情報は持たない(visitor_hash は IP+端末+日付 のハッシュで、回数制限にだけ使う)。
create table if not exists public.locapass_shop_ai_chats (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  question text not null,
  answer text,
  lang text,
  visitor_hash text not null,
  answerable boolean not null default true,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_locapass_shop_ai_chats_shop_created on public.locapass_shop_ai_chats (shop_id, created_at desc);
create index if not exists idx_locapass_shop_ai_chats_visitor_created on public.locapass_shop_ai_chats (visitor_hash, created_at desc);
create index if not exists idx_locapass_shop_ai_chats_unanswered on public.locapass_shop_ai_chats (shop_id, created_at desc) where answerable = false and handled = false;
alter table public.locapass_shop_ai_chats enable row level security;
revoke all on public.locapass_shop_ai_chats from anon, authenticated;
grant select on public.locapass_shop_ai_chats to authenticated;
create policy "shop admins read shop ai chats" on public.locapass_shop_ai_chats for select to authenticated using (public.locapass_is_shop_admin(shop_id));

-- AIの知識: 店舗がファイル(PDF・写真・Word・テキスト)を置くと、AIが読み取った文章が入る。確認してOKを押すと有効(active)になる。
create table if not exists public.locapass_shop_ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  kind text not null check (kind in ('file', 'note', 'answer')),
  title text not null,
  source_name text,
  extracted_text text not null default '',
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive')),
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_locapass_shop_ai_knowledge_shop on public.locapass_shop_ai_knowledge (shop_id, status, updated_at desc);
alter table public.locapass_shop_ai_knowledge enable row level security;
revoke all on public.locapass_shop_ai_knowledge from anon, authenticated;
grant select on public.locapass_shop_ai_knowledge to authenticated;
create policy "shop admins read shop ai knowledge" on public.locapass_shop_ai_knowledge for select to authenticated using (public.locapass_is_shop_admin(shop_id));

-- 改善提案: たまった質問ログを、まとめて1回で要約して作る(質問のたびにはAIを呼ばない)。
create table if not exists public.locapass_shop_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops (id) on delete cascade,
  body text not null,
  question_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_locapass_shop_ai_suggestions_shop on public.locapass_shop_ai_suggestions (shop_id, created_at desc);
alter table public.locapass_shop_ai_suggestions enable row level security;
revoke all on public.locapass_shop_ai_suggestions from anon, authenticated;
grant select on public.locapass_shop_ai_suggestions to authenticated;
create policy "shop admins read shop ai suggestions" on public.locapass_shop_ai_suggestions for select to authenticated using (public.locapass_is_shop_admin(shop_id));

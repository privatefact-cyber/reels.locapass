-- 【DM/問い合わせ機能の権限整理】
-- 三層構造:
--   ・一般ユーザー: キャスト個人へのDMは不可。店舗宛ての「来店予約・問い合わせDM」のみ送信可。
--   ・キャストアカウント: DM機能を一切持たせない(投稿・プロフィール編集のみ)。今回この用途のテーブル/RPCは作らない。
--   ・店舗・運営アカウント: 管理画面で問い合わせ一覧の閲覧・返信を行う。
--
-- public.messages はどのマイグレーションにも記録が無く、アプリコードからの参照も0件、
-- RLSポリシーも無い(=事実上誰も読み書きできない)まま残っていた「とりあえず作られて放置された」痕跡。
-- sender_id/recipient_idがauth.users参照のため、ログイン不要な一般ユーザー向けの設計にも合わない。
-- 今回のDM機能用に正式なテーブルへ作り直す(現状0行・未参照のため安全に置き換え可能)。
drop table if exists public.messages;

-- 問い合わせスレッド本体(店舗宛てのみ。キャスト宛ては意図的に作らない)。
-- 一般ユーザーはログイン不要(reel_likesと同じviewer_id方式)。ただしviewer_idの推測だけで
-- 他人のスレッドを覗かれると困るため、テーブルへの直接select/insertはanonへ許可せず、
-- 発行されたinquiry_id(uuid)をviewer_idとセットで知っていることを鍵とするSECURITY DEFINER RPC
-- 経由でのみ読み書きさせる(cast_field_tokens/cast_login_tokensと同じ設計思想)。
create table public.shop_inquiries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  viewer_id uuid not null,
  customer_name text,
  contact text,
  status text not null default 'open' check (status in ('open', 'responded', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_shop_inquiries_shop_id on public.shop_inquiries (shop_id, created_at desc);
create index idx_shop_inquiries_viewer_id on public.shop_inquiries (viewer_id);

create trigger trg_shop_inquiries_set_updated_at
  before update on public.shop_inquiries
  for each row
  execute function public.set_updated_at();

alter table public.shop_inquiries enable row level security;

-- 店舗スタッフ(自店舗)・運営者のみ直接select/update可。anonからの直接アクセスは不可(RPC経由のみ)。
create policy "shop read own inquiries"
  on public.shop_inquiries for select
  to authenticated
  using (shop_id in (select public.current_shop_ids()) or public.is_platform_admin());

create policy "shop update own inquiries status"
  on public.shop_inquiries for update
  to authenticated
  using (shop_id in (select public.current_shop_ids()) or public.is_platform_admin())
  with check (shop_id in (select public.current_shop_ids()) or public.is_platform_admin());

-- スレッド内メッセージ(顧客発言・店舗返信の両方をここに積む)。
create table public.shop_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.shop_inquiries (id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'shop')),
  shop_staff_id uuid references public.shop_staff (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_shop_inquiry_messages_inquiry_id on public.shop_inquiry_messages (inquiry_id, created_at);

alter table public.shop_inquiry_messages enable row level security;

create policy "shop read own inquiry messages"
  on public.shop_inquiry_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.shop_inquiries i
      where i.id = inquiry_id
        and (i.shop_id in (select public.current_shop_ids()) or public.is_platform_admin())
    )
  );

create policy "shop reply to own inquiries"
  on public.shop_inquiry_messages for insert
  to authenticated
  with check (
    sender_type = 'shop'
    and exists (
      select 1 from public.shop_inquiries i
      where i.id = inquiry_id
        and (i.shop_id in (select public.current_shop_ids()) or public.is_platform_admin())
    )
  );

-- 店舗が返信したら「対応済み」に、顧客が追記したら「未対応」に戻す。
create or replace function public.mark_inquiry_status_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_type = 'shop' then
    update public.shop_inquiries set status = 'responded', updated_at = now() where id = new.inquiry_id;
  else
    update public.shop_inquiries set status = 'open', updated_at = now() where id = new.inquiry_id;
  end if;
  return new;
end;
$$;

create trigger trg_shop_inquiry_messages_mark_status
  after insert on public.shop_inquiry_messages
  for each row
  execute function public.mark_inquiry_status_on_message();

-- 【一般ユーザー(ログイン不要)向けRPC】店舗にのみ送信可能。キャスト個人宛てDMは意図的に作らない。

create or replace function public.create_shop_inquiry(
  p_shop_id uuid,
  p_viewer_id uuid,
  p_customer_name text,
  p_contact text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry_id uuid;
begin
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'message body is required';
  end if;
  if not exists (select 1 from public.shops where id = p_shop_id and status = 'active') then
    raise exception 'shop not found';
  end if;

  insert into public.shop_inquiries (shop_id, viewer_id, customer_name, contact)
  values (p_shop_id, p_viewer_id, nullif(trim(p_customer_name), ''), nullif(trim(p_contact), ''))
  returning id into v_inquiry_id;

  insert into public.shop_inquiry_messages (inquiry_id, sender_type, body)
  values (v_inquiry_id, 'customer', p_body);

  return v_inquiry_id;
end;
$$;

revoke all on function public.create_shop_inquiry(uuid, uuid, text, text, text) from public;
grant execute on function public.create_shop_inquiry(uuid, uuid, text, text, text) to anon, authenticated;

create or replace function public.add_inquiry_message(
  p_inquiry_id uuid,
  p_viewer_id uuid,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'message body is required';
  end if;
  if not exists (
    select 1 from public.shop_inquiries where id = p_inquiry_id and viewer_id = p_viewer_id
  ) then
    raise exception 'inquiry not found';
  end if;

  insert into public.shop_inquiry_messages (inquiry_id, sender_type, body)
  values (p_inquiry_id, 'customer', p_body);
end;
$$;

revoke all on function public.add_inquiry_message(uuid, uuid, text) from public;
grant execute on function public.add_inquiry_message(uuid, uuid, text) to anon, authenticated;

create or replace function public.get_inquiry_thread(p_inquiry_id uuid, p_viewer_id uuid)
returns table(
  id uuid,
  shop_id uuid,
  shop_name text,
  status text,
  created_at timestamptz,
  messages jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    i.id,
    i.shop_id,
    s.name,
    i.status,
    i.created_at,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'senderType', m.sender_type,
          'body', m.body,
          'createdAt', m.created_at
        ) order by m.created_at)
        from public.shop_inquiry_messages m
        where m.inquiry_id = i.id
      ),
      '[]'::jsonb
    )
  from public.shop_inquiries i
  join public.shops s on s.id = i.shop_id
  where i.id = p_inquiry_id and i.viewer_id = p_viewer_id;
$$;

revoke all on function public.get_inquiry_thread(uuid, uuid) from public;
grant execute on function public.get_inquiry_thread(uuid, uuid) to anon, authenticated;

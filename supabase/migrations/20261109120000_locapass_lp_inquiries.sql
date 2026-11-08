-- LPの問い合わせフォーム(掲載店・販売代理店)の受付と、返信までの履歴。
-- 読み書きはサーバー専用クライアント(受付API・管理画面)だけで行い、Data APIには公開しない。
create table if not exists public.locapass_lp_inquiries (
  id uuid primary key default gen_random_uuid(),
  -- shop: 掲載店のお問い合わせ / agency: 販売代理店のお問い合わせ
  type text not null check (type in ('shop', 'agency')),
  -- new: 新規 / in_progress: 対応中 / replied: 返信済み / closed: 完了
  status text not null default 'new' check (status in ('new', 'in_progress', 'replied', 'closed')),
  -- 店舗名・施設名(shop) または 会社名(agency)
  subject text not null,
  name text not null,
  -- フォームに入力された連絡先(メールアドレスまたは電話番号)
  contact text not null,
  -- contact がメールアドレスのときだけ入れる(返信メールの宛先)
  email text,
  area text,
  -- 業種・事業内容など、種別ごとに違う項目
  details jsonb not null default '{}'::jsonb,
  note text,
  source_page text,
  -- 連投の制限用。IPアドレスそのものは保存せず、ハッシュだけ持つ。
  ip_hash text,
  last_replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists locapass_lp_inquiries_status_idx on public.locapass_lp_inquiries (status, created_at desc);
create index if not exists locapass_lp_inquiries_ip_idx on public.locapass_lp_inquiries (ip_hash, created_at desc);

create table if not exists public.locapass_lp_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.locapass_lp_inquiries(id) on delete cascade,
  -- reply_email: メールで送った返信 / reply_manual: 電話・メールアプリなどで返信したと記録 / note: 社内メモ
  kind text not null check (kind in ('reply_email', 'reply_manual', 'note')),
  body text not null,
  to_email text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists locapass_lp_inquiry_messages_inquiry_idx on public.locapass_lp_inquiry_messages (inquiry_id, created_at);

alter table public.locapass_lp_inquiries enable row level security;
alter table public.locapass_lp_inquiry_messages enable row level security;
revoke all on table public.locapass_lp_inquiries from anon, authenticated;
revoke all on table public.locapass_lp_inquiry_messages from anon, authenticated;

create policy "service role manages lp inquiries" on public.locapass_lp_inquiries
  for all to service_role using (true) with check (true);
create policy "service role manages lp inquiry messages" on public.locapass_lp_inquiry_messages
  for all to service_role using (true) with check (true);

drop trigger if exists trg_locapass_lp_inquiries_updated_at on public.locapass_lp_inquiries;
create trigger trg_locapass_lp_inquiries_updated_at
  before update on public.locapass_lp_inquiries
  for each row execute function public.locapass_touch_updated_at();

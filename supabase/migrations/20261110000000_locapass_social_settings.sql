-- SNS自動投稿: AIへの指示(アカウントごと)。管理画面から書く。サービスロール経由でのみ読み書きする(RLSは有効、ポリシー無し)。
create table if not exists public.locapass_social_settings (
  account text primary key check (account in ('locapass', 'luxela')),
  instructions text not null default '',
  examples text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.locapass_social_settings enable row level security;
insert into public.locapass_social_settings (account) values ('locapass'), ('luxela') on conflict do nothing;

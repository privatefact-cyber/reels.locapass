-- サイト全体の設定を持つ1行だけのテーブル。まずはトップのFEATURED枠(提携店舗特集)の
-- 表示可否だけを持たせる。機能自体(コード・データ)は残したまま、運営が管理画面から
-- ワンタップでオン/オフできるようにするための箱。
--
-- 「1店舗のキャバクラサイトに見える」という理由でいったんオフにしてほしい、という
-- ユーザー要望(2026-09-14)。featured_rankや取り込んだ紹介文・料金データは削除しない。

create table if not exists public.platform_settings (
  -- boolean型のPKにdefault true + check(id)を組み合わせて、行が常に1つ(id=true)だけに
  -- なるようにする「シングルトンテーブル」の定石パターン。2行目のinsertは主キー重複で弾かれる。
  id boolean primary key default true check (id),
  featured_section_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 初期値はオフ(今回の要望どおり)。既に行があれば何もしない。
insert into public.platform_settings (id, featured_section_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

-- 公開ページ(トップ)がこの値を見て表示可否を決めるので、誰でも読めるようにする。
create policy "anyone can read platform settings"
  on public.platform_settings for select
  to anon, authenticated
  using (true);

-- 変更は運営者だけ。
create policy "platform admin update settings"
  on public.platform_settings for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

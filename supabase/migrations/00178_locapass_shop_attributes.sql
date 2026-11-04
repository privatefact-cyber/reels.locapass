-- 店舗の「属性」(ペット同伴可・駐車場など。1店に複数)。将来AI検索に読ませる構造化データ。
-- キー・表示名・詳細の入力欄の形は lib/verticals/attributes.ts、どの業態に出すかは lib/verticals/registry.ts。
-- 行が無い = 「なし」ではなく「未設定」。公開ページには行がある(オンの)属性だけを出し、「不可」とは出さない。
-- 業態を変えても行は消さない(新しい業態で出さない属性は、表示しないだけ)。
create table if not exists public.locapass_shop_attributes (
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  attribute_key text not null check (attribute_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  -- 詳細(選択式の値)。例: pet_ok → {"size": ["small","medium"], "place": ["terrace"]}。空の項目は持たない(未設定)。
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, attribute_key)
);

-- 地図の🐾スイッチ(pet_ok / pet_only を持つ店)で引くための索引。
create index if not exists locapass_shop_attributes_key_idx on public.locapass_shop_attributes (attribute_key, shop_id);

drop trigger if exists locapass_shop_attributes_updated_at on public.locapass_shop_attributes;
create trigger locapass_shop_attributes_updated_at
  before update on public.locapass_shop_attributes
  for each row execute function public.locapass_set_updated_at();

alter table public.locapass_shop_attributes enable row level security;

-- 公開ページ・地図用。店舗の公開ルールに従う(サブクエリが locapass_shops のRLSを通るので、
-- 公開前ポータルの店(00156)・非公開の店の属性は一般の人には見えない)。ログイン中の人にも見せる(CLAUDE.md)。
create policy "shop attributes public read of active shops" on public.locapass_shop_attributes
  for select to anon, authenticated
  using (exists (select 1 from public.locapass_shops s where s.id = locapass_shop_attributes.shop_id and s.status = 'active'));

create policy "shop attributes read by shop staff" on public.locapass_shop_attributes
  for select to authenticated
  using (public.locapass_is_shop_staff(shop_id));

-- 書き込みはその店の管理者以上(shop_admin・ポータル管理者・ルート管理者)。
create policy "shop attributes manage by shop admin" on public.locapass_shop_attributes
  for all to authenticated
  using (public.locapass_is_shop_admin(shop_id))
  with check (public.locapass_is_shop_admin(shop_id));

-- 既存の「ペット」業種の店は、業態を other にした(00177)代わりに「ペット同伴可」を付けておく(詳細は未設定)。
-- 運営が supabase/checks/business_type_review.sql で確認し、ペット専用の店などは付け直す。
insert into public.locapass_shop_attributes (shop_id, attribute_key)
select s.id, 'pet_ok' from public.locapass_shops s where s.category = 'ペット'
on conflict (shop_id, attribute_key) do nothing;

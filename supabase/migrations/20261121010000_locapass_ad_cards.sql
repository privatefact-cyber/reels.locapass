-- 店舗ページの広告枠に出すカード(自社の告知・将来の広告)を、管理画面から登録できるようにする。2026-11-21。
-- 上の枠(mid)は有効なカードを横スライドで並べ、下の枠(bottom)は1枚の横長バナーを出す。
-- 公開側は「有効(is_active)」のカードだけ読める。書き込みはスーパー管理者だけ。
create table if not exists public.locapass_ad_cards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null check (char_length(title) <= 100),         -- 管理用の名前(お客様には出ない)
  label text not null default 'PR' check (char_length(label) <= 20), -- 「PR」「お知らせ」など。広告と分かる表示を必ず付ける
  headline text not null check (char_length(headline) <= 80),
  body text check (char_length(body) <= 200),
  cta text not null default '詳しく見る' check (char_length(cta) <= 30),
  link_url text not null check (link_url ~ '^(/|https://)'),
  image_url text,
  placement text not null default 'mid' check (placement in ('mid', 'bottom', 'both')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  translations jsonb
);
create index if not exists locapass_ad_cards_active_idx on public.locapass_ad_cards (is_active, sort_order);
alter table public.locapass_ad_cards enable row level security;

drop policy if exists "read active ad cards" on public.locapass_ad_cards;
create policy "read active ad cards" on public.locapass_ad_cards for select to anon, authenticated using (is_active);

drop policy if exists "super admin manage ad cards" on public.locapass_ad_cards;
create policy "super admin manage ad cards" on public.locapass_ad_cards for all to authenticated
  using (locapass_is_super_admin()) with check (locapass_is_super_admin());

-- 広告の表示・タップの記録(locapass_ad_events)に、カードのid(uuid)を入れられる。creative は「ad:<id>」の形で入れる(80文字以内)。

-- 最初のカード: ロカわん連携のお知らせ(有効)と、掲載店向けのプラン案内(いまは停止)。
insert into public.locapass_ad_cards (title, label, headline, body, cta, link_url, placement, is_active, sort_order, translations)
select 'ロカわん連携のお知らせ', 'PR', 'ペットのためのアプリ「ロカわん」が連携しました!', '愛犬の手帳・ペットと行けるお店やスポットの地図・誕生日の通知まで、これ1つで', 'ロカわんを見る', '/pet/app', 'both', true, 10,
  '{"en":{"label":"Ad","headline":"Locawan, the app for pets, is now connected!","body":"Your dog''s notebook, a map of pet-friendly places and birthday reminders, all in one app","cta":"See Locawan"},"zh":{"label":"广告","headline":"宠物专属应用「Locawan」已联动!","body":"爱犬手册、可带宠物的店铺地图、生日提醒,一个应用全搞定","cta":"查看 Locawan"},"ar":{"label":"إعلان","headline":"تطبيق Locawan للحيوانات الأليفة أصبح متصلاً الآن!","body":"دفتر كلبك وخريطة الأماكن التي تقبل الحيوانات وتذكير أعياد الميلاد في تطبيق واحد","cta":"عرض Locawan"}}'::jsonb
where not exists (select 1 from public.locapass_ad_cards where title = 'ロカわん連携のお知らせ');

insert into public.locapass_ad_cards (title, label, headline, body, cta, link_url, placement, is_active, sort_order, translations)
select '掲載店向けプラン案内', 'お知らせ', '掲載店の方へ', '有料掲載にすると、このページの広告枠とおすすめ枠が消え、他店ページで優先して紹介されます', 'プランを相談する', '/support', 'mid', false, 20,
  '{"en":{"label":"Notice","headline":"For venue owners","body":"Upgrade to remove ads on this page and be featured first on other venues'' pages","cta":"Ask about plans"},"zh":{"label":"通知","headline":"致店家","body":"升级为付费后,本页的广告将消失,并优先出现在其他店铺页面","cta":"咨询方案"},"ar":{"label":"إشعار","headline":"لأصحاب المتاجر","body":"بالترقية تختفي الإعلانات من هذه الصفحة وتظهر متجرك أولاً في صفحات المتاجر الأخرى","cta":"اسأل عن الباقات"}}'::jsonb
where not exists (select 1 from public.locapass_ad_cards where title = '掲載店向けプラン案内');

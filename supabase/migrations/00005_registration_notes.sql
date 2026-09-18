-- 登録時に加盟店が書く自由記述の状況説明(動機メモ)。
--
-- blacklists.reason_category はカテゴリ分類(cancel/trouble/fly等)に過ぎず、
-- 後日トラブルになった際に運営者(当社)が「どのような状況で登録されたのか」を
-- 把握して対処するには不十分。そのための自由記述メモを別テーブルに分離する。
--
-- 重要: 他店舗はもちろん、書いた本人(登録した店舗自身)も含めて、加盟店側からは
-- 一切読み返せない(SELECTポリシーを一切作らない=書き込み専用)。運営者のみ閲覧可能。
--
-- blacklists 側の行が誤登録などで物理削除された後もメモ自体は運営者の調査資料として
-- 残す必要があるため、blacklist_id に外部キー制約は張らない
-- (blacklist_audit_log と同じ考え方)。

create table public.blacklist_registration_notes (
  id uuid primary key default gen_random_uuid(),
  blacklist_id uuid not null,
  note text not null,
  created_by_shop_id uuid not null references public.shops (id),
  created_at timestamptz not null default now()
);

create index idx_blacklist_registration_notes_blacklist_id
  on public.blacklist_registration_notes (blacklist_id);

alter table public.blacklist_registration_notes enable row level security;

-- 加盟店: 自店舗が登録した blacklists 行に対してのみ、新規メモを書き込める。
-- SELECT/UPDATE/DELETE ポリシーは意図的に一切用意しない(書いた本人も含めて読み返し・改ざん不可)。
create policy "shop insert note for own blacklist entry"
  on public.blacklist_registration_notes for insert
  to authenticated
  with check (
    created_by_shop_id in (select public.current_shop_ids())
    and exists (
      select 1 from public.blacklists b
      where b.id = blacklist_id
        and b.registered_by_shop_id in (select public.current_shop_ids())
    )
  );

-- 運営者: 閲覧のみ可能。改ざん防止のため運営者にもUPDATE/DELETEポリシーは用意しない。
create policy "platform admin read registration notes"
  on public.blacklist_registration_notes for select
  to authenticated
  using (public.is_platform_admin());

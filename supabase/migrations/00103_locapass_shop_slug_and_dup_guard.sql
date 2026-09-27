-- 店舗slugの再構築(店名からの人間が読める値に作り直す)と、
-- ポータル単位での重複店舗登録ガードを追加する。
--
-- 背景: 既存のslug列は運用初期のバックフィルでランダム値(例: bd97701c54)や
-- venue-21のような連番プレースホルダーが大量に入っており、しかも
-- portal_id + slugのユニーク制約はportal単位のため、venue-21のような
-- 値が複数ポータルで衝突していた(/shops/[shopId]をslugベースの
-- /{portalSlug}/shops/[shopSlug]に切り替える前提のクリーンアップ)。
--
-- 加えて、今後代理店が各ポータルに直接店舗を登録できるようにする計画があり、
-- 同じ店舗が誤って二重登録されるケースが増える見込みのため、
-- 「同一ポータル内で店名+住所が両方一致」した場合はinsert/updateを
-- 拒否するトリガーを追加する(店名だけの一致は同名チェーン店の別店舗を
-- 誤ブロックする可能性があるため、住所も一致した場合のみ弾く)。

create or replace function public.locapass_slugify(input text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(btrim(input)), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ),
    ''
  );
$$;

-- ロカパス自体の集約ポータル行(id=55)にもslugを補完しておく。
update public.locapass_portals set slug = 'locapass' where id = 55 and (slug is null or slug = '');

-- 店舗名から人間が読めるslugを再生成し、ポータル内で重複したら -2, -3 ... を付与する。
-- 日本語のみでラテン文字が取れない店舗名はshop_code(既存の一意な識別子)を使う。
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in
    select id, portal_id, name, shop_code
    from public.locapass_shops
    order by portal_id, created_at, id
  loop
    base := public.locapass_slugify(r.name);
    if base is null or length(base) < 2 then
      base := 'shop-' || lower(r.shop_code);
    end if;

    candidate := base;
    n := 1;
    while exists (
      select 1 from public.locapass_shops
      where portal_id = r.portal_id and slug = candidate and id <> r.id
    ) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;

    update public.locapass_shops set slug = candidate where id = r.id;
  end loop;
end $$;

alter table public.locapass_shops alter column slug set not null;

-- 重複店舗ガード: 同一portal_id内で店名・住所(前後空白/連続空白を正規化)が
-- 両方一致する行が既にあればinsert/updateを拒否する。住所未入力の行は判定不能なのでスキップ。
create or replace function public.locapass_shops_guard_duplicate()
returns trigger
language plpgsql
as $$
declare
  v_existing_id uuid;
  v_existing_name text;
begin
  if new.address is null or btrim(new.address) = '' then
    return new;
  end if;

  select id, name into v_existing_id, v_existing_name
  from public.locapass_shops
  where portal_id = new.portal_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and lower(regexp_replace(btrim(name), '\s+', '', 'g')) = lower(regexp_replace(btrim(new.name), '\s+', '', 'g'))
    and address is not null
    and lower(regexp_replace(btrim(address), '\s+', '', 'g')) = lower(regexp_replace(btrim(new.address), '\s+', '', 'g'))
  limit 1;

  if v_existing_id is not null then
    raise exception '同じポータルに店名・住所が一致する店舗が既に登録されています: % (id: %)', v_existing_name, v_existing_id
      using errcode = '23505',
            hint = '既存店舗を確認するか、店名/住所の入力内容を見直してください';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_locapass_shops_guard_duplicate on public.locapass_shops;
create trigger trg_locapass_shops_guard_duplicate
  before insert or update of name, address, portal_id on public.locapass_shops
  for each row execute function public.locapass_shops_guard_duplicate();

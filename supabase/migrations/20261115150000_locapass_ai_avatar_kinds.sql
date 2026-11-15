-- 店舗AIコンシェルジュの「顔」に、任意のFACES(cast)を選べるようにする。
--   none: 顔を使わない(AIのアイコンだけ) / cast: 任意のFACES / staff: 店長などスタッフ / custom: 店舗が決めたキャラクターの画像
-- cast / staff / custom は、写真に写る本人の承諾を、店舗が確認(ai_avatar_consent)したときだけ使う。
-- 注意: 外部キーは付けない(PostgRESTの埋め込みが曖昧になるため)。存在確認は、サーバー側で行う。
alter table public.locapass_shops drop constraint if exists locapass_shops_ai_avatar_kind_check;
alter table public.locapass_shops add constraint locapass_shops_ai_avatar_kind_check check (ai_avatar_kind in ('none', 'cast', 'staff', 'custom'));
alter table public.locapass_shops add column if not exists ai_avatar_cast_id uuid;

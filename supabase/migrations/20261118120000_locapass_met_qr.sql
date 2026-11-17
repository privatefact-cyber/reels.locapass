-- 「直接会った人用のQR」: FACES本人の画面に出る、数分で変わるQRを読み込むと、相互フォローになってDMが開く。
-- つながった経路を残すため、フォローの2つのテーブルに source 列を足す('qr' = 会った人用のQRでつながった)。
-- 書き込みはサーバー(service role)が行う。署名つきの短命トークンの検証はアプリ側(lib/met/token.ts)。
alter table public.locapass_cast_follows add column if not exists source text;
alter table public.locapass_user_follows add column if not exists source text;
create index if not exists locapass_cast_follows_qr_idx on public.locapass_cast_follows (cast_id, created_at desc) where source = 'qr';

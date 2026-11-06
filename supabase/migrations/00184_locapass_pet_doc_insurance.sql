-- 書類の種類に「ペット保険証」を追加(保険会社・証券番号・満了日をAIで読み取り、満了日が近づいたら知らせる)。2026-11-07。
-- 書類・通院明細の画像はサーバーに保存しない方針に変更(端末内のIndexedDBのみ)。image_path / image_paths には
-- 端末内の画像を指す "local:<uuid>" という文字だけを入れる(画像そのものは入らない)。テーブル構造は変えない。
alter table public.locapass_pet_documents drop constraint if exists locapass_pet_documents_doc_type_check;
alter table public.locapass_pet_documents add constraint locapass_pet_documents_doc_type_check
  check (doc_type in ('rabies', 'license', 'mixed_vaccine', 'insurance', 'other'));

-- キャストの本人確認情報(免許証・マイナンバーカードOCRで入力)と与信照会結果のスナップショット。
-- name は既存の源氏名カラムのため、本名・フリガナ・生年月日・住所・電話番号は別カラムとして追加する。
-- 身分証画像そのものは保存しない(抽出済みテキストのみ保持)。

alter table public.cast_members
  add column if not exists legal_name text,
  add column if not exists legal_name_kana text,
  add column if not exists birth_date date,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists id_check_match_level text,
  add column if not exists id_check_hit_count integer,
  add column if not exists id_checked_at timestamptz;

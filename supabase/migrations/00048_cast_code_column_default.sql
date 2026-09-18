-- cast_codeがBEFORE INSERTトリガーのみで自動生成される設計だと、Supabaseの型生成が
-- INSERT時に必須のプロパティとして扱ってしまい、cast_codeを指定していない既存の
-- addCast(app/dashboard/cast/actions.ts)がtsc上エラーになる。列に直接DEFAULTを
-- 設定し、INSERT時に省略可能であることを型生成にも正しく伝える(トリガーは
-- 明示的にNULLを渡された場合の保険としてそのまま残す)。
alter table public.cast_members alter column cast_code set default public.generate_cast_code();

-- ロカわん: 外部のAIサービスにデータを送ることへの同意(App Storeの審査ガイドライン5.1.2で必須)。
-- 同意した日時を持つ。NULL = 未同意(または取り消し)。サーバー側で、AIに送る前にこの列を確かめる。
alter table public.locapass_pet_owner_settings
  add column if not exists ai_consent_at timestamptz;

comment on column public.locapass_pet_owner_settings.ai_consent_at is
  'ロカわん: 書類の写真の読取・公開前の写真の確認・AIコンシェルジュで、外部のAI(Gemini)にデータを送ることへ同意した日時。NULLなら未同意。';

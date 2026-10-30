-- 店舗が文章を入力する言語。NULL は「自動判定」(従来どおり、仮名があれば日本語、無ければAIが判定)。
-- 日本語・英語・中国語に限らず、外国人オーナーの母国語(ネパール語・ベトナム語など)を指定できる(lib/i18n/languages.ts)。
-- 指定した言語は、自動翻訳の「原文の言語」として使う(判定の誤りと、判定のAI呼び出しがなくなる)。
alter table public.locapass_shops
  add column if not exists input_lang text
    check (input_lang is null or input_lang ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$');

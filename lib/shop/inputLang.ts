import type { SupabaseClient } from "@supabase/supabase-js";
import { isLanguageCode } from "@/lib/i18n/languages";

/**
 * 店舗が指定した入力言語(自動翻訳の原文の言語)。未指定・不正な値は null(自動判定)。
 * 店舗の文章(紹介文・メニュー・イベント・リール投稿文など)の翻訳に使う。サーバー専用。
 */
export async function shopInputLang(db: SupabaseClient, shopId: string | null | undefined): Promise<string | null> {
  if (!shopId) return null;
  const { data } = await db.from("locapass_shops").select("input_lang").eq("id", shopId).maybeSingle();
  return normalizeInputLang((data as { input_lang?: string | null } | null)?.input_lang);
}

export function normalizeInputLang(value: string | null | undefined): string | null {
  return isLanguageCode(value) ? value : null;
}

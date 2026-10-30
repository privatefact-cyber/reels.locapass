import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import { needsTranslation, preserveManualTranslations, translateFields, translateFieldsBatch } from "@/lib/i18n/contentTranslation";
import { normalizeInputLang } from "@/lib/shop/inputLang";

/**
 * 店舗の文章の翻訳を、今の日本語に合わせて作り直す(日本語が変わっていなければ何もしない)。
 * 翻訳に失敗したら古い翻訳は消して日本語表示に戻す(元の文章と食い違った翻訳を出し続けないため)。
 * 次に保存したときに再挑戦する。
 */
export async function refreshShopTranslations(supabase: SupabaseClient<Database>, shopId: string): Promise<void> {
  const { data } = await supabase
    .from("locapass_shops")
    .select("description, tagline, business_hours, price_info, usage_notes, translations, input_lang")
    .eq("id", shopId)
    .maybeSingle();
  if (!data) return;

  const fields = {
    description: data.description,
    tagline: data.tagline,
    business_hours: data.business_hours,
    price_info: data.price_info,
    usage_notes: data.usage_notes,
  };
  const inputLang = normalizeInputLang((data as { input_lang?: string | null }).input_lang);
  if (!needsTranslation(fields, data.translations, undefined, inputLang)) return;

  let translations = null;
  try {
    translations = preserveManualTranslations(await translateFields(fields, inputLang), data.translations);
  } catch (e) {
    console.error("店舗情報の翻訳に失敗しました:", e);
  }

  await supabase
    .from("locapass_shops")
    .update({ translations: (translations ?? {}) as unknown as Json })
    .eq("id", shopId);
}

/** 料金項目名をまとめて翻訳する。失敗時は空の翻訳(日本語表示)を返す。 */
export async function translatePriceItemNames(names: string[], sourceLang?: string | null): Promise<Json[]> {
  if (names.length === 0) return [];
  try {
    const results = await translateFieldsBatch(names.map((name) => ({ name })), undefined, names.map(() => sourceLang));
    return results.map((r) => (r ?? {}) as unknown as Json);
  } catch (e) {
    console.error("料金項目名の翻訳に失敗しました:", e);
    return names.map(() => ({}) as Json);
  }
}

/** イベントのタイトル・本文を翻訳する。失敗時は空の翻訳(日本語表示)を返す。 */
export async function translateEventText(title: string, body: string | null, sourceLang?: string | null): Promise<Json> {
  try {
    return ((await translateFields({ title, body }, sourceLang)) ?? {}) as unknown as Json;
  } catch (e) {
    console.error("イベントの翻訳に失敗しました:", e);
    return {} as Json;
  }
}

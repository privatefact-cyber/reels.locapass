import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import { needsTranslation, translateFields, translateFieldsBatch } from "@/lib/i18n/contentTranslation";

/**
 * 店舗の文章の翻訳を、今の日本語に合わせて作り直す(日本語が変わっていなければ何もしない)。
 * 翻訳に失敗したら古い翻訳は消して日本語表示に戻す(元の文章と食い違った翻訳を出し続けないため)。
 * 次に保存したときに再挑戦する。
 */
export async function refreshShopTranslations(supabase: SupabaseClient<Database>, shopId: string): Promise<void> {
  const { data } = await supabase
    .from("shops")
    .select("description, tagline, business_hours, price_info, usage_notes, translations")
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
  if (!needsTranslation(fields, data.translations)) return;

  let translations = null;
  try {
    translations = await translateFields(fields);
  } catch (e) {
    console.error("店舗情報の翻訳に失敗しました:", e);
  }

  await supabase
    .from("shops")
    .update({ translations: (translations ?? {}) as unknown as Json })
    .eq("id", shopId);
}

/** 料金項目名をまとめて翻訳する。失敗時は空の翻訳(日本語表示)を返す。 */
export async function translatePriceItemNames(names: string[]): Promise<Json[]> {
  if (names.length === 0) return [];
  try {
    const results = await translateFieldsBatch(names.map((name) => ({ name })));
    return results.map((r) => (r ?? {}) as unknown as Json);
  } catch (e) {
    console.error("料金項目名の翻訳に失敗しました:", e);
    return names.map(() => ({}) as Json);
  }
}

/** イベントのタイトル・本文を翻訳する。失敗時は空の翻訳(日本語表示)を返す。 */
export async function translateEventText(title: string, body: string | null): Promise<Json> {
  try {
    return ((await translateFields({ title, body })) ?? {}) as unknown as Json;
  } catch (e) {
    console.error("イベントの翻訳に失敗しました:", e);
    return {} as Json;
  }
}

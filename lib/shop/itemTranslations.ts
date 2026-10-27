import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/types/supabase";
import { needsTranslation, translateFields } from "@/lib/i18n/contentTranslation";
import { itemSourceFields } from "@/lib/shop/items";

/**
 * 掲載アイテム(車両)の文章を、英語・中国語・アラビア語に翻訳して保存する。サーバー専用。
 * 日本語が変わっていなければ何もしない。失敗したら古い翻訳は消して日本語表示に戻す
 * (元の文章と食い違った翻訳を出し続けないため)。取りこぼしは毎晩の自動処理(/api/cron/translations)が拾う。
 */
export async function refreshItemTranslations(db: SupabaseClient, itemId: string): Promise<void> {
  const { data } = await db
    .from("locapass_shop_items")
    .select("title, description, price_label, attributes, translations")
    .eq("id", itemId)
    .maybeSingle();
  if (!data) return;

  const fields = itemSourceFields(data as Parameters<typeof itemSourceFields>[0]);
  if (!needsTranslation(fields, data.translations)) return;

  let translations = null;
  try {
    translations = await translateFields(fields);
  } catch (e) {
    console.error("掲載アイテムの翻訳に失敗しました:", e);
  }
  await db
    .from("locapass_shop_items")
    .update({ translations: (translations ?? {}) as unknown as Json })
    .eq("id", itemId);
}

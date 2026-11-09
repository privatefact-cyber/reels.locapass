import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/types/supabase";
import { asStoredTranslations, needsTranslation, preserveManualTranslations, translateFields, translationSourceHash } from "@/lib/i18n/contentTranslation";
import { shopInputLang } from "@/lib/shop/inputLang";

/**
 * リールの投稿文(caption)を、英語・中国語・アラビア語に翻訳して保存する。
 * 日本語が変わっていなければ何もしない。失敗したら古い翻訳は消して原文表示に戻す。
 */
export async function refreshReelTranslation(db: SupabaseClient, reelId: string): Promise<void> {
  const { data } = await db.from("locapass_reels").select("caption, translations, shop_id").eq("id", reelId).maybeSingle();
  if (!data) return;
  const fields = { caption: data.caption };
  if (!data.caption?.trim()) return;
  // 店舗の投稿は、店舗が指定した入力言語を原文として訳す(キャスト個人の投稿は自動判定)。
  const inputLang = await shopInputLang(db, (data as { shop_id?: string | null }).shop_id);
  if (!needsTranslation(fields, data.translations, undefined, inputLang)) return;
  let translations = null;
  try {
    translations = await translateFields(fields, inputLang);
    // 投稿文が変わっていない(言語指定の変更・足りない言語の作り足し)ときは、手直しした訳を残す。文が変わったら手直しは捨てる。
    if (asStoredTranslations(data.translations).source_hash === translationSourceHash(fields)) {
      translations = preserveManualTranslations(translations, data.translations);
    }
  } catch (e) {
    console.error("リール投稿文の翻訳に失敗しました:", e);
  }
  await db.from("locapass_reels").update({ translations: (translations ?? {}) as unknown as Json }).eq("id", reelId);
}

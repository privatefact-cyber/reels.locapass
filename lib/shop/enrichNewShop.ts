import type { SupabaseClient } from "@supabase/supabase-js";
import { translateAddressesToEnglish } from "@/lib/map/translateAddress";
import { sweepTranslations } from "@/lib/i18n/sweepTranslations";

/**
 * 取り込み(動画ストックなど)で新しく作った店舗の「足りない項目」を埋める。サーバー専用。
 * - カバー写真は扱わない。Google Places の写真は費用がかかるため新規店舗には使わない(2026-10-23の決定)。
 *   写真が無い店は、一覧などで最新リールの画像が代わりに出る。
 * - 住所の英語表記(address_en): 毎晩の翻訳処理を待たずに作る。
 * - 紹介文などの翻訳: 文章がある店舗だけ、毎晩の翻訳処理と同じ処理をその店舗に限って走らせる。
 * 1項目が失敗しても他は続け、結果を返す(呼び出し側は失敗で店舗登録を止めない)。
 */

export type EnrichResult = {
  shopId: string;
  name: string;
  addressEn: "filled" | "skipped" | "error";
  translations: "filled" | "skipped" | "error";
  note?: string;
};

type Shop = {
  id: string; name: string; address: string | null; area: string | null; lat: number | null; lng: number | null;
  address_en: string | null; description: string | null;
};

export async function enrichNewShop(db: SupabaseClient<any>, shopId: string): Promise<EnrichResult> {
  const { data, error } = await db.from("locapass_shops")
    .select("id, name, address, area, lat, lng, address_en, description")
    .eq("id", shopId).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "店舗が見つかりません");
  const shop = data as Shop;
  const result: EnrichResult = { shopId, name: shop.name, addressEn: "skipped", translations: "skipped" };
  const notes: string[] = [];

  if (shop.address?.trim() && !shop.address_en) {
    try {
      const [en] = await translateAddressesToEnglish([shop.address]);
      if (!en) throw new Error("英語表記を作れませんでした");
      const { data: updated, error: upErr } = await db.from("locapass_shops").update({ address_en: en }).eq("id", shop.id).select("id");
      if (upErr || !updated?.length) throw new Error(upErr?.message ?? "更新0件");
      result.addressEn = "filled";
    } catch (e) {
      result.addressEn = "error";
      notes.push(`住所英語: ${e instanceof Error ? e.message.slice(0, 120) : "失敗"}`);
    }
  }

  if (shop.description?.trim()) {
    try {
      const sweep = await sweepTranslations(db, { maxRows: 5, deadlineMs: 30_000, shopId: shop.id });
      result.translations = (sweep.results.shops?.translated ?? 0) > 0 ? "filled" : "skipped";
    } catch (e) {
      result.translations = "error";
      notes.push(`翻訳: ${e instanceof Error ? e.message.slice(0, 120) : "失敗"}`);
    }
  }

  if (notes.length) result.note = notes.join(" / ");
  return result;
}

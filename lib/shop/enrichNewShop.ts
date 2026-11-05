import type { SupabaseClient } from "@supabase/supabase-js";
import { COVER_URL_PREFIX, distanceMeters, searchPlace, toAttribution, type PlaceCandidate } from "@/lib/places/googlePlaces";
import { translateAddressesToEnglish } from "@/lib/map/translateAddress";
import { sweepTranslations } from "@/lib/i18n/sweepTranslations";

/**
 * 取り込み(動画ストックなど)で新しく作った店舗の「足りない項目」を埋める。サーバー専用。
 * - カバー写真: Google Places の写真を中継方式で紐づける(scripts/fill-shop-photos-from-google.ts と同じ判定)。
 *   画像は保存せず、cover_url を /api/place-photo/{shopId} にし、撮影者クレジットを保存する。
 * - 住所の英語表記(address_en): 毎晩の翻訳処理を待たずに作る。
 * - 紹介文などの翻訳: 文章がある店舗だけ、毎晩の翻訳処理と同じ処理をその店舗に限って走らせる。
 * 1項目が失敗しても他は続け、結果を返す(呼び出し側は失敗で店舗登録を止めない)。
 */

const MAX_DISTANCE_M = 400;
const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s　・･\-ー_()（）「」【】]/g, "");

/** 店名がほぼ一致するか(どちらかがどちらかを含む)。 */
function nameMatches(shopName: string, place: PlaceCandidate) {
  const a = norm(shopName);
  const b = norm(place.displayName?.text ?? "");
  return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
}

/** 候補のうち、同じ店と判断できて(近い かつ 店名が似ている)写真があるものを選ぶ。 */
function pickCandidate(shop: { name: string; lat: number | null; lng: number | null }, candidates: PlaceCandidate[]) {
  for (const c of candidates) {
    if (!c.photos?.length) continue;
    const near = shop.lat != null && shop.lng != null && c.location
      ? distanceMeters({ lat: shop.lat, lng: shop.lng }, c.location) <= MAX_DISTANCE_M
      : null;
    if (near === false) continue;
    if (!nameMatches(shop.name, c)) continue;
    return c;
  }
  return null;
}

export type EnrichResult = {
  shopId: string;
  name: string;
  photo: "filled" | "skipped" | "no_match" | "error";
  addressEn: "filled" | "skipped" | "error";
  translations: "filled" | "skipped" | "error";
  note?: string;
};

type Shop = {
  id: string; name: string; address: string | null; area: string | null; lat: number | null; lng: number | null;
  cover_url: string | null; google_place_id: string | null; address_en: string | null; description: string | null;
};

export async function enrichNewShop(db: SupabaseClient<any>, shopId: string): Promise<EnrichResult> {
  const { data, error } = await db.from("locapass_shops")
    .select("id, name, address, area, lat, lng, cover_url, google_place_id, address_en, description")
    .eq("id", shopId).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "店舗が見つかりません");
  const shop = data as Shop;
  const result: EnrichResult = { shopId, name: shop.name, photo: "skipped", addressEn: "skipped", translations: "skipped" };
  const notes: string[] = [];

  if (!shop.cover_url && !shop.google_place_id) {
    try {
      const query = [shop.name, shop.address ?? shop.area].filter(Boolean).join(" ");
      const near = shop.lat != null && shop.lng != null ? { lat: shop.lat, lng: shop.lng } : null;
      const hit = pickCandidate(shop, await searchPlace(query, near));
      if (!hit) {
        result.photo = "no_match";
      } else {
        const photo = hit.photos![0];
        const { data: updated, error: upErr } = await db.from("locapass_shops").update({
          google_place_id: hit.id,
          google_photo_name: photo.name,
          cover_image_attribution: toAttribution(photo),
          cover_url: `${COVER_URL_PREFIX}${shop.id}`,
        }).eq("id", shop.id).select("id");
        if (upErr || !updated?.length) throw new Error(upErr?.message ?? "更新0件");
        result.photo = "filled";
      }
    } catch (e) {
      result.photo = "error";
      notes.push(`写真: ${e instanceof Error ? e.message.slice(0, 120) : "失敗"}`);
    }
  }

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

import { ATTRIBUTES, sanitizeAttributeDetail, type AttributeField } from "@/lib/verticals/attributes";

/** 料理の属性(cuisine)の詳細から、選ばれた料理の日本語名(「ラーメン・つけ麺」など)を並べて返す。 */
export function cuisineLabelsFromDetail(detail: unknown): string[] {
  const field = (ATTRIBUTES.cuisine.fields as readonly AttributeField[]).find((f) => f.kind === "multi");
  if (!field || field.kind !== "multi") return [];
  const picked = sanitizeAttributeDetail("cuisine", detail)[field.key];
  if (!Array.isArray(picked)) return [];
  return field.options.filter((o) => picked.includes(o.value)).map((o) => o.label.ja);
}

/** 店舗が選んだ料理の日本語名。属性の表は生成済みの型に無いので any で扱う。失敗したら空(紹介文は料理なしで作る)。 */
export async function getShopCuisineLabels(supabase: unknown, shopId: string): Promise<string[]> {
  try {
    const { data } = await (supabase as { from: (t: string) => any })
      .from("locapass_shop_attributes")
      .select("detail")
      .eq("shop_id", shopId)
      .eq("attribute_key", "cuisine")
      .maybeSingle();
    return cuisineLabelsFromDetail(data?.detail);
  } catch {
    return [];
  }
}

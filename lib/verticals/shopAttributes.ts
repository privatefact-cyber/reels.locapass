import type { Locale } from "@/lib/i18n/locale";
import { ATTRIBUTES, attributeDetailSummary, isAttributeKey, sanitizeAttributeDetail, type AttributeField, type AttributeKey } from "@/lib/verticals/attributes";
import { verticalOf } from "@/lib/verticals/registry";

/** items は、選択肢が多い属性(料理)の選ばれた項目。1つずつタップして、その項目の店舗一覧(/tag/{属性}?v={値})へ行けるようにする。 */
export type PublicShopAttribute = { key: AttributeKey; icon: string; label: string; details: string[]; items?: { value: string; label: string }[] };

// 業態・属性の列/テーブル(00177・00178)は生成済みの型に無いので any で扱う。
type Loose = { from: (t: string) => any };

/**
 * 公開ページに出す属性(オンの属性だけ)。その店の業態で出す属性に絞り、並びも業態の定義どおりにする
 * (業態を変えて出さなくなった属性は、行が残っていても出さない)。
 * 行が無い属性は「未設定」なので何も出さない(「不可」とは出さない)。取得に失敗したら空(属性欄なしで表示する)。
 */
export async function getPublicShopAttributes(supabase: unknown, shopId: string, locale: Locale): Promise<PublicShopAttribute[]> {
  const db = supabase as Loose;
  const [{ data: shop }, { data: rows, error }] = await Promise.all([
    db.from("locapass_shops").select("business_type").eq("id", shopId).maybeSingle(),
    db.from("locapass_shop_attributes").select("attribute_key, detail").eq("shop_id", shopId),
  ]);
  if (error || !rows) return [];
  const byKey = new Map<string, unknown>((rows as { attribute_key: string; detail: unknown }[]).map((r) => [r.attribute_key, r.detail]));
  return verticalOf(shop?.business_type)
    .attributes.filter((k) => byKey.has(k) && isAttributeKey(k))
    .map((key) => ({
      key,
      icon: ATTRIBUTES[key].icon,
      label: ATTRIBUTES[key].label[locale],
      details: attributeDetailSummary(key, byKey.get(key), locale),
      items: selectedItems(key, byKey.get(key), locale),
    }));
}

/** 選択肢が多い属性(modal)の、選ばれた項目を1つずつ返す。それ以外の属性は undefined。 */
function selectedItems(key: AttributeKey, detail: unknown, locale: Locale): { value: string; label: string }[] | undefined {
  const def = ATTRIBUTES[key];
  if (!("modal" in def) || !def.modal) return undefined;
  const field = (def.fields as readonly AttributeField[]).find((f) => f.kind === "multi");
  if (!field || field.kind !== "multi") return undefined;
  const picked = sanitizeAttributeDetail(key, detail)[field.key];
  if (!Array.isArray(picked)) return undefined;
  return field.options.filter((o) => picked.includes(o.value)).map((o) => ({ value: o.value, label: o.label[locale] }));
}

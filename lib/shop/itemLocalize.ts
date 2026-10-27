import type { Locale } from "@/lib/i18n/locale";
import { pickTranslation } from "@/lib/i18n/contentTranslation";
import type { ShopItem } from "@/lib/shop/items";

/** 表示言語に合わせて、翻訳がある項目を差し替えたアイテムを返す(翻訳が無い項目は日本語のまま)。 */
export function localizeItem(item: ShopItem, locale: Locale): ShopItem {
  if (locale === "ja") return item;
  const pick = (original: string | null | undefined, key: string) =>
    original ? (pickTranslation(locale, original, item.translations, key).text ?? original) : original;
  const a = item.attributes ?? {};
  return {
    ...item,
    title: pick(item.title, "title") ?? item.title,
    description: pick(item.description, "description") ?? null,
    price_label: pick(item.price_label, "price_label") ?? null,
    attributes: {
      ...a,
      year: pick(a.year, "year") ?? undefined,
      inspection: pick(a.inspection, "inspection") ?? undefined,
      color: pick(a.color, "color") ?? undefined,
      fuel: pick(a.fuel, "fuel") ?? undefined,
    },
  };
}

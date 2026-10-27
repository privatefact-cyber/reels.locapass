import Link from "next/link";
import { ITEM_GRID_CLASS, ShopItemCard } from "@/components/shop/ShopItemCard";
import type { Locale } from "@/lib/i18n/locale";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localizeItem } from "@/lib/shop/itemLocalize";
import { itemPath, itemsPath, type ShopItem } from "@/lib/shop/items";

const PREVIEW_COUNT = 6; // スマホの3列×2段

/** 店舗ページの「在庫」セクション。ページが長くならないよう、先頭の数台だけをグリッドで見せ、全件は一覧ページへ。 */
export function ShopItemsSection({
  items,
  totalCount,
  portalSlug,
  shopSlug,
  officialUrl,
  locale,
  t,
}: {
  items: ShopItem[];
  totalCount: number;
  portalSlug: string;
  shopSlug: string;
  officialUrl: string | null;
  locale: Locale;
  t: Dictionary["items"];
}) {
  if (items.length === 0) return null;
  const preview = items.slice(0, PREVIEW_COUNT).map((i) => localizeItem(i, locale));
  return (
    <section id="items" className="scroll-mt-24 space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <h2 className="font-display text-base font-semibold text-hl-100">{t.title}</h2>
        <Link href={itemsPath(portalSlug, shopSlug)} className="shrink-0 text-xs font-semibold text-hl-300 hover:text-hl-100">
          {t.viewAll(totalCount)}
        </Link>
      </div>
      <div className={ITEM_GRID_CLASS}>
        {preview.map((item) => (
          <ShopItemCard key={item.id} item={item} href={itemPath(portalSlug, shopSlug, item.id)} locale={locale} t={t} />
        ))}
      </div>
      {officialUrl && (
        <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="block rounded-full border border-line/30 px-4 py-2 text-center text-xs font-semibold text-tone-300 hover:text-main">
          {t.officialLatest}
        </a>
      )}
    </section>
  );
}

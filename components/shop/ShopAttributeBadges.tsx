import Link from "@/components/i18n/LocaleLink";
import type { PublicShopAttribute } from "@/lib/verticals/shopAttributes";

const CHIP = "inline-flex max-w-full items-center gap-1.5 rounded-full border border-line/20 bg-panel-900/60 px-3 py-1.5 text-xs text-tone-200 transition hover:border-accent active:scale-95";

/** 店舗ページの属性(ペット同伴可・駐車場など)。オンの属性だけを、アイコンと短い文言で並べる。 */
export function ShopAttributeBadges({ attributes }: { attributes: PublicShopAttribute[] }) {
  if (attributes.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {attributes.map((a) =>
        a.items?.length ? (
          // 料理など: 選ばれた項目を1つずつチップにして、タップするとその項目の店舗一覧(/tag/{属性}?v={値})へ。
          a.items.map((item) => (
            <li key={`${a.key}:${item.value}`} className="max-w-full">
              <Link href={`/tag/${a.key}?v=${item.value}`} className={CHIP}>
                <span aria-hidden>{a.icon}</span>
                <span className="font-semibold">{item.label}</span>
              </Link>
            </li>
          ))
        ) : (
          <li key={a.key} className="max-w-full">
            {/* タップすると、この属性の店舗一覧(/tag/{属性})へ。 */}
            <Link href={`/tag/${a.key}`} className={CHIP}>
              <span aria-hidden>{a.icon}</span>
              <span className="font-semibold">{a.label}</span>
              {a.details.length > 0 && <span className="truncate text-tone-400">{a.details.join(" / ")}</span>}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}

import type { PublicShopAttribute } from "@/lib/verticals/shopAttributes";

/** 店舗ページの属性(ペット同伴可・駐車場など)。オンの属性だけを、アイコンと短い文言で並べる。 */
export function ShopAttributeBadges({ attributes }: { attributes: PublicShopAttribute[] }) {
  if (attributes.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {attributes.map((a) => (
        <li
          key={a.key}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line/20 bg-panel-900/60 px-3 py-1.5 text-xs text-tone-200"
        >
          <span aria-hidden>{a.icon}</span>
          <span className="font-semibold">{a.label}</span>
          {a.details.length > 0 && <span className="truncate text-tone-400">{a.details.join(" / ")}</span>}
        </li>
      ))}
    </ul>
  );
}

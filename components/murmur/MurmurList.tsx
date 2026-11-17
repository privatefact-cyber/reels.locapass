import Link from "@/components/i18n/LocaleLink";
import { murmurLabels, murmurRelativeTime } from "@/lib/murmur/labels";
import type { MurmurItem } from "@/lib/murmur/queries";
import { shopPath } from "@/lib/locapass/publicUrls";

/** ひとこと一覧・タイムラインの1件ずつの表示(店のアイコン・店名・本文・写真・時間)。 */
export function MurmurList({ items, locale, showShop = true }: { items: MurmurItem[]; locale: string; showShop?: boolean }) {
  const t = murmurLabels(locale);
  if (items.length === 0) return <p className="py-10 text-center text-sm text-tone-400">{t.empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((m) => (
        <li key={m.id} className="rounded-2xl border border-tone-700/60 bg-tone-900/70 p-4">
          {showShop && (
            <Link href={shopPath(m.portalSlug, m.shopSlug)} className="flex items-center gap-2">
              {m.shopIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.shopIconUrl} alt="" loading="lazy" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tone-800 text-sm font-semibold text-tone-400">{m.shopName.slice(0, 1)}</span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-main"><bdi>{m.shopName}</bdi></span>
              <time dateTime={m.createdAt} className="shrink-0 text-[11px] text-tone-400">{murmurRelativeTime(m.createdAt, locale)}</time>
            </Link>
          )}
          <p dir="auto" className={`${showShop ? "mt-2" : ""} whitespace-pre-wrap break-words text-sm leading-relaxed text-main`}>{m.body}</p>
          {m.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.imageUrl} alt="" loading="lazy" className="mt-3 max-h-80 w-full rounded-xl object-cover" />
          )}
          {!showShop && <time dateTime={m.createdAt} className="mt-2 block text-[11px] text-tone-400">{murmurRelativeTime(m.createdAt, locale)}</time>}
        </li>
      ))}
    </ul>
  );
}

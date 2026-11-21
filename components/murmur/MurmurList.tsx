import Link from "@/components/i18n/LocaleLink";
import { murmurLabels, murmurRelativeTime } from "@/lib/murmur/labels";
import type { MurmurItem } from "@/lib/murmur/queries";
import { shopPath } from "@/lib/locapass/publicUrls";

/** ひとこと一覧・タイムライン(店のアイコン・店名・本文・写真・時間)。 */
export function MurmurList({ items, locale, showShop = true }: { items: MurmurItem[]; locale: string; showShop?: boolean }) {
  const t = murmurLabels(locale);
  if (items.length === 0) return <p className="py-10 text-center text-sm text-tone-400">{t.empty}</p>;
  // Threads・Xのように、カードで区切らず、細い線でつなげた1本のタイムライン。左にアイコン、右に店名・本文・写真。
  return (
    <ul>
      {items.map((m) => {
        const avatar = m.shopIconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.shopIconUrl} alt="" loading="lazy" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-tone-800 text-sm font-semibold text-tone-400">{m.shopName.slice(0, 1)}</span>
        );
        const href = shopPath(m.portalSlug, m.shopSlug);
        return (
          <li key={m.id} className="flex gap-3 border-b border-tone-700/60 px-1 py-4">
            {showShop ? (
              <Link href={href} className="shrink-0" aria-label={m.shopName}>
                {avatar}
              </Link>
            ) : (
              <span className="shrink-0">{avatar}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                {showShop ? (
                  <Link href={href} className="min-w-0 truncate text-sm font-semibold text-main">
                    <bdi>{m.shopName}</bdi>
                  </Link>
                ) : (
                  <span className="min-w-0 truncate text-sm font-semibold text-main">
                    <bdi>{m.shopName}</bdi>
                  </span>
                )}
                <time dateTime={m.createdAt} className="shrink-0 text-xs text-tone-400">
                  {murmurRelativeTime(m.createdAt, locale)}
                </time>
              </div>
              <p dir="auto" className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-main">{m.body}</p>
              {m.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.imageUrl} alt="" loading="lazy" className="mt-2 max-h-96 w-full rounded-xl border border-tone-700/40 object-cover" />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

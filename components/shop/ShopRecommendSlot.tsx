import Link from "@/components/i18n/LocaleLink";
import { ShopMediaFallback } from "@/components/shop/ShopMediaFallback";
import { gridThumb } from "@/lib/images/thumb";
import { shopPath } from "@/lib/locapass/publicUrls";
import type { RelatedShop } from "@/lib/recommend/shops";

/**
 * 店舗ページ下部の「この近くのおすすめ」枠(無料掲載の店舗ページだけ。出し分けは lib/recommend/slot.ts)。
 * 有料掲載の店は先頭に並び、「PR」を付ける(広告であることを明示する)。
 * preview=true は店主の管理画面のプレビュー用(言語の切り替えが無い画面なので、普通のリンクを新しいタブで開く)。
 */
export function ShopRecommendSlot({
  items,
  title,
  prLabel,
  preview = false,
}: {
  items: RelatedShop[];
  title?: string;
  prLabel: string;
  preview?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-3">
      {title && <h2 className="text-sm font-bold text-tone-100">{title}</h2>}
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((s) => {
          const href = shopPath(s.portalSlug, s.slug);
          const thumb = gridThumb(s.coverImageUrl);
          const tile = (
            <>
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <span className="relative block h-full w-full overflow-hidden bg-panel-900">
                  <ShopMediaFallback category={s.genre} seed={s.id} name={s.name} showCredit={false} thumb />
                </span>
              )}
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
              {s.sponsored && (
                <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
                  {prLabel}
                </span>
              )}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-4 text-white">
                <span dir="auto" className="block truncate text-[11px] font-semibold drop-shadow">{s.name}</span>
                {(s.genre || s.area) && (
                  <span dir="auto" className="block truncate text-[10px] text-white/70">{[s.area, s.genre].filter(Boolean).join(" · ")}</span>
                )}
              </span>
            </>
          );
          const cls = "relative block aspect-[4/5] w-32 shrink-0 snap-start overflow-hidden rounded-xl bg-panel-900";
          return (
            <li key={s.id}>
              {preview ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                  {tile}
                </a>
              ) : (
                <Link href={href} data-surface="media" className={cls}>
                  {tile}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

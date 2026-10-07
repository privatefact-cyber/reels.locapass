import Link from "next/link";

/**
 * 「店舗ページ(1枚目) / 動画ストック(2枚目)」を示す2点のドットインジケーター。
 * 目立たせず、横スワイプで行き来できることを視覚的に示す。タップでも移動できる。
 */
export function PageDots({
  current,
  shopHref,
  archiveHref,
}: {
  current: 0 | 1;
  shopHref: string;
  archiveHref: string;
}) {
  const dot = (active: boolean) =>
    `block h-1.5 rounded-full transition-all ${active ? "w-4 bg-hl-300" : "w-1.5 bg-main/30"}`;
  return (
    <nav aria-label="pages" className="flex items-center justify-center gap-1.5 py-1">
      <Link href={shopHref} aria-label="shop" aria-current={current === 0 ? "page" : undefined} className="p-1.5">
        <span className={dot(current === 0)} />
      </Link>
      <Link href={archiveHref} aria-label="archive" aria-current={current === 1 ? "page" : undefined} className="p-1.5">
        <span className={dot(current === 1)} />
      </Link>
    </nav>
  );
}

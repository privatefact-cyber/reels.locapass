import Link from "next/link";
import type { Locale } from "@/lib/i18n/locale";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { formatItemPrice, statusBadge, type ShopItem } from "@/lib/shop/items";

// トップページのリール一覧(ReelFeed)と同じ列数・すき間にそろえる(スマホ3列・PCは画面に合わせて増える)。
export const ITEM_GRID_CLASS =
  "grid w-full grid-cols-3 gap-[1px] sm:landscape:grid-cols-4 sm:portrait:grid-cols-6 md:landscape:grid-cols-6 md:gap-[2px] md:max-w-7xl md:mx-auto lg:landscape:grid-cols-8";

/**
 * 在庫グリッドのタイル。縦長(幅80:高さ120)の長方形で、上が写真(4:3)・下が車名と金額。
 * 文字を写真に重ねない(写真の見やすさと文字の読みやすさの両立)。詳細はタップ先で見せる。
 * item は表示言語に合わせて localizeItem 済みのものを渡す。売約済みは写真を暗くし、商談中・売約済みはバッジを出す。
 */
export function ShopItemCard({ item, href, locale, t }: { item: ShopItem; href: string; locale: Locale; t: Dictionary["items"] }) {
  const badge = statusBadge(item.status, t);
  const dim = item.status === "sold";
  return (
    <Link href={href} className="flex aspect-[2/3] flex-col overflow-hidden bg-panel-900">
      <div className="relative aspect-[4/3] w-full shrink-0 bg-black">
        {item.image_urls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_urls[0]} alt={item.title} loading="lazy" className={`absolute inset-0 h-full w-full object-cover ${dim ? "opacity-50" : ""}`} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-tone-500">{t.noImage}</div>
        )}
        {badge && (
          <span className="absolute left-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-main md:left-2 md:top-2 md:px-2.5 md:text-[11px]">{badge}</span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-between px-1.5 py-1.5 md:px-2.5 md:py-2">
        <p className="line-clamp-3 text-[10px] font-semibold leading-snug text-main md:text-[11px]">{item.title}</p>
        <p className="text-[11px] font-bold leading-tight text-hl-300 md:text-sm">{formatItemPrice(item, locale, t)}</p>
      </div>
    </Link>
  );
}

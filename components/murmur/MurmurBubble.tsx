import Link from "@/components/i18n/LocaleLink";
import { murmurLabels, murmurRelativeTime } from "@/lib/murmur/labels";
import type { MurmurItem } from "@/lib/murmur/queries";

/** 店舗ページに出す、最新のひとこと1件(吹き出し)。過去の分は、一覧ページへのリンクから見られる。 */
export function MurmurBubble({ item, locale, archiveHref }: { item: MurmurItem; locale: string; archiveHref: string }) {
  const t = murmurLabels(locale);
  return (
    <section aria-label={t.shopTitle} className="px-4 sm:px-6">
      <div className="relative rounded-2xl border border-tone-700/60 bg-tone-900/70 p-4 shadow-lg">
        <div className="flex items-center justify-between gap-2 text-[11px] text-tone-400">
          <span className="font-semibold tracking-wide text-hl-300">💬 {t.shopTitle}</span>
          <time dateTime={item.createdAt}>{murmurRelativeTime(item.createdAt, locale)}</time>
        </div>
        <p dir="auto" className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-main">{item.body}</p>
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" loading="lazy" className="mt-3 max-h-64 w-full rounded-xl object-cover" />
        )}
        <Link href={archiveHref} className="mt-3 inline-block text-xs text-hl-300 underline underline-offset-2">
          {t.seeAll} →
        </Link>
      </div>
    </section>
  );
}

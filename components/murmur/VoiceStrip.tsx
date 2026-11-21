import Link from "@/components/i18n/LocaleLink";
import { murmurLabels, murmurRelativeTime } from "@/lib/murmur/labels";
import type { MurmurItem } from "@/lib/murmur/queries";

/**
 * トップ(グランドトップ・各ポータル)に出す、VOICEの入口。最新の数件を1行ずつ並べ、「もっと見る」でタイムラインへ。
 * 1件も無ければ何も出さない。
 */
export function VoiceStrip({ items, href, locale }: { items: MurmurItem[]; href: string; locale: string }) {
  if (items.length === 0) return null;
  const t = murmurLabels(locale);
  return (
    <section aria-label="VOICE" className="mx-2 rounded-2xl border border-tone-700/60 bg-tone-900/70 px-4 pt-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-wide text-main">💬 VOICE</h2>
        <Link href={href} className="text-xs text-hl-300 underline underline-offset-2">
          {t.seeMore} →
        </Link>
      </div>
      <ul className="mt-1">
        {items.map((m) => (
          <li key={m.id} className="border-b border-tone-700/40 last:border-b-0">
            <Link href={href} className="flex items-center gap-3 py-2.5">
              {m.shopIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.shopIconUrl} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tone-800 text-xs font-semibold text-tone-400">{m.shopName.slice(0, 1)}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] text-tone-400">
                  <bdi>{m.shopName}</bdi> · {murmurRelativeTime(m.createdAt, locale)}
                </span>
                <span dir="auto" className="block truncate text-sm text-main">{m.body}</span>
              </span>
              {m.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.imageUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from "next/link";
import type { PortalEvent } from "@/lib/types/shop";
import { formatEventDateRange } from "@/lib/events/formatEventDateRange";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";

/** デスクトップ幅用のグリッドカード。フルスクリーン版と違い、ページの通常フローに乗る。 */
export function EventGridCard({ event }: { event: PortalEvent }) {
  return (
    <Link
      href={`/images/no-image.jpg
      className="group relative block aspect-[9/16] overflow-hidden rounded-2xl border border-amber-500/20 bg-neutral-950 shadow-xl transition hover:border-amber-400/40 hover:shadow-amber-500/10"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sanitizeImageUrl(event.imageUrl)}
        alt={event.title}
        loading="lazy"
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/40" />

      <div className="absolute inset-x-3 top-3 flex flex-wrap gap-2">
        {event.area && (
          <span className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            📍 {event.area}
          </span>
        )}
        {event.genre && (
          <span className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            🍸 {event.genre}
          </span>
        )}
      </div>

      <div className="absolute inset-x-3 bottom-3 space-y-0.5">
        <h2 className="font-display text-lg font-bold uppercase leading-tight tracking-wide text-white drop-shadow-lg">
          {event.title}
        </h2>
        <p className="text-xs text-amber-100/80">
          {event.shopName}
          {formatEventDateRange(event) && (
            <span className="ml-2 text-amber-200/60">{formatEventDateRange(event)}</span>
          )}
        </p>
      </div>
    </Link>
  );
}

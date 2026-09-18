import Link from "next/link";
import type { PortalEvent } from "@/lib/types/shop";
import { formatEventDateRange } from "@/lib/events/formatEventDateRange";

export function EventCard({
  event,
  active,
  containerRef,
}: {
  event: PortalEvent;
  /** 表示中のスライドの前後1枚だけtrue。それ以外は画像自体をマウントしない(通信量・メモリ節約)。 */
  active: boolean;
  containerRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={containerRef} className="relative h-[100dvh] w-full shrink-0 snap-start snap-always bg-neutral-950">
      {active ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.imageUrl}
          alt={event.title}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900 to-black" />
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/50" />

      <div className="absolute inset-x-4 bottom-24 space-y-3">
        <div className="flex flex-wrap gap-2">
          {event.area && (
            <span className="rounded-full bg-black/50 px-3 py-1 text-[12px] font-semibold text-white backdrop-blur-sm">
              📍 {event.area}
            </span>
          )}
          {event.genre && (
            <span className="rounded-full bg-black/50 px-3 py-1 text-[12px] font-semibold text-white backdrop-blur-sm">
              🍸 {event.genre}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <h2 className="font-display text-2xl font-bold uppercase leading-tight tracking-wide text-white drop-shadow-lg">
            {event.title}
          </h2>
          <p className="text-sm text-amber-100/80">
            {event.shopName}
            {formatEventDateRange(event) && (
              <span className="ml-2 text-amber-200/60">{formatEventDateRange(event)}</span>
            )}
          </p>
        </div>

        <Link
          href={`/shops/${event.shopId}`}
          className="flex w-fit items-center gap-1 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold tracking-wide text-white backdrop-blur-md"
        >
          ▲ SWIPE UP FOR DETAILS
        </Link>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Phone, MapPin, Zap, MessageCircle, Store } from "lucide-react";
import { BoostCountdown } from "./BoostCountdown";
import type { BoostItem } from "@/lib/boost/types";
import type { BoostText } from "@/lib/boost/text";
import { photoResized } from "@/components/photo/photoUtils";

function mapUrl(s: BoostItem["shop"]): string | null {
  if (s.lat != null && s.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=walking`;
  }
  if (s.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${s.address}`)}`;
  return null;
}

export function BoostCard({ boost, now, t }: { boost: BoostItem; now: number; t: BoostText }) {
  const ended = new Date(boost.expiresAt).getTime() <= now;
  const map = mapUrl(boost.shop);
  const tel = boost.shop.tel?.replace(/[^0-9+]/g, "");
  return (
    <article
      className={`overflow-hidden rounded-2xl border border-amber-400/40 bg-gradient-to-b from-zinc-900 to-black shadow-lg shadow-amber-500/10 transition-opacity duration-700 ${ended ? "opacity-40" : ""}`}
    >
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-black">
        <span className="flex items-center gap-1 text-sm font-black">
          <Zap className="h-4 w-4 fill-black" /> {t.limited}
        </span>
        {boost.discountTag && <span className="rounded-full bg-black px-3 py-0.5 text-xs font-black text-amber-300">{boost.discountTag}</span>}
      </div>

      <div className="px-4 pt-4">
        {ended ? (
          <p className="text-3xl font-black text-white/70">{t.ended}</p>
        ) : (
          <BoostCountdown expiresAt={boost.expiresAt} now={now} remainLabel={t.remain} />
        )}
      </div>

      {boost.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoResized(boost.imageUrl, 720, true)} alt={boost.title} loading="lazy" className="mt-3 aspect-[4/3] w-full object-cover" />
      )}

      <div className="space-y-2 px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-bold text-amber-200">
          {boost.shop.iconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={boost.shop.iconUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
          )}
          {boost.shop.name}
        </div>
        <h2 className="text-lg font-black leading-snug text-white">{boost.title}</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{boost.description}</p>
        <p className="text-[11px] text-amber-200/80">※ {t.hint}</p>
      </div>

      {!ended && (
        <div className="space-y-2 px-4 pb-4">
          <div className="grid grid-cols-2 gap-2">
            {boost.shop.lineUrl ? (
              <a href={boost.shop.lineUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-[#06C755] py-3.5 text-sm font-black text-white active:scale-95">
                <MessageCircle className="h-4 w-4" /> {t.line}
              </a>
            ) : null}
            {tel ? (
              <a href={`tel:${tel}`} className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-3.5 text-sm font-black text-black active:scale-95">
                <Phone className="h-4 w-4" /> {t.call}
              </a>
            ) : null}
          </div>
          {map && (
            <a href={map} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-400 py-3.5 text-sm font-black text-black active:scale-95">
              <MapPin className="h-4 w-4" /> {t.go}
            </a>
          )}
          {boost.shop.shopPath && (
            <Link href={boost.shop.shopPath} className="flex items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/10 py-3.5 text-sm font-black text-white active:scale-95">
              <Store className="h-4 w-4" /> {t.more}
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

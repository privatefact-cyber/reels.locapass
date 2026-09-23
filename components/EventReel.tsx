"use client";

import { useState } from "react";
import { EventGridCard } from "@/components/EventGridCard";
import type { PortalEvent } from "@/lib/types/shop";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { genreLabel } from "@/lib/i18n/genreLabels";

export function EventReel({
  events,
  genreChoices,
}: {
  events: PortalEvent[];
  genreChoices: string[];
}) {
  const { locale, t } = useLocale();
  const [activeGenres, setActiveGenres] = useState<string[]>([]);

  const filtered = events.filter(
    (e) => !activeGenres.length || (e.genre && activeGenres.includes(e.genre)),
  );

  function toggleGenre(g: string) {
    setActiveGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  // トップページと同じく、ヘッダー/ボトムナビを残したページの通常フローに乗る
  // グリッド表示に統一する(以前のモバイル版はフルスクリーン縦スナップ1枚送りで、
  // 一覧性が低く分かりにくかったため)。
  return (
    <div className="space-y-4 px-4 pb-8 sm:px-6 md:mx-auto md:max-w-[1400px] md:py-8">
      <div className="flex flex-wrap gap-2 px-1">
        {genreChoices.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => toggleGenre(g)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              activeGenres.includes(g)
                ? "border-amber-400 bg-gradient-to-r from-amber-400 to-amber-500 text-zinc-950"
                : "border-neutral-700 text-neutral-300"
            }`}
          >
            {genreLabel(locale, g)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="px-2 py-16 text-center text-sm text-neutral-500">{t.feed.noEvents}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((event) => (
            <EventGridCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

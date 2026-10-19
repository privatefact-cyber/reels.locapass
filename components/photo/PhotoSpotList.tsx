"use client";

import { useMemo, useState } from "react";
import { Heart, MapPin, Navigation } from "lucide-react";
import type { PhotoArea, PhotoPost } from "@/lib/photo/getPhotoPosts";
import { buildHiddenSpots, sortHiddenSpots, type HiddenSpotSort } from "@/lib/photo/hiddenSpots";
import { photoResized, photoRouteUrl } from "@/components/photo/photoUtils";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { areaLabel, dateLocaleTag } from "@/lib/photo/labels";

/**
 * 「穴場」: 掲載店ではない場所(Googleの場所・手入力)の写真を、場所ごとにまとめて人気順/新着順で見せる。
 * カードの写真をタップすると、その場所の写真の一覧(縦ビューア)へ。
 */
export function PhotoSpotList({
  posts,
  areas,
  onOpenSpot,
}: {
  posts: PhotoPost[];
  areas: PhotoArea[];
  onOpenSpot: (spotPosts: PhotoPost[], index: number, title: string) => void;
}) {
  const { t, locale } = useLocale();
  const [sort, setSort] = useState<HiddenSpotSort>("popular");
  const spots = useMemo(() => sortHiddenSpots(buildHiddenSpots(posts), sort), [posts, sort]);
  const areaBySlug = useMemo(() => new Map(areas.map((a) => [a.slug, a])), [areas]);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs ${
      active ? "border-main bg-main text-on-accent" : "border-tone-700 text-tone-300 hover:text-main"
    }`;

  return (
    <div className="space-y-3 px-3 pb-10">
      <p className="text-xs text-tone-500">{t.photo.spotsIntro}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setSort("popular")} className={chip(sort === "popular")}>
          {t.photo.spotsSortPopular}
        </button>
        <button type="button" onClick={() => setSort("new")} className={chip(sort === "new")}>
          {t.photo.spotsSortNew}
        </button>
      </div>

      {spots.length === 0 ? (
        <p className="py-10 text-center text-sm text-tone-500">{t.photo.spotsEmpty}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {spots.map((spot) => {
            const area = areaBySlug.get(spot.site);
            return (
              <li key={spot.id} className="overflow-hidden rounded-2xl border border-main/15 bg-tone-900/60">
                <div className="grid grid-cols-3 gap-[2px]">
                  {spot.posts.slice(0, 3).map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onOpenSpot(spot.posts, i, spot.name)}
                      className="relative aspect-square overflow-hidden bg-tone-900"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoResized(p.imageUrl, 360, true)} alt={spot.name} loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5 p-3">
                  <button type="button" onClick={() => onOpenSpot(spot.posts, 0, spot.name)} className="block w-full text-left">
                    <p className="truncate text-base font-medium text-main">{spot.name}</p>
                  </button>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-tone-500">
                    <span>{t.photo.count(spot.posts.length)}</span>
                    {spot.likeCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Heart size={11} /> {spot.likeCount}
                      </span>
                    )}
                    {area && (
                      <span className="flex items-center gap-0.5">
                        <MapPin size={11} /> {areaLabel(area, locale, t.photo)}
                      </span>
                    )}
                    <span>{new Date(spot.latest).toLocaleDateString(dateLocaleTag(locale))}</span>
                  </div>
                  <a
                    href={photoRouteUrl(spot.posts[0])}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <Navigation size={13} />
                    {t.photo.directions}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

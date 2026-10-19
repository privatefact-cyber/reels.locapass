"use client";

import { useState } from "react";
import { MapPin, Navigation, Play } from "lucide-react";
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { PhotoFullscreen } from "@/components/photo/PhotoFullscreen";
import { photoResized, photoRouteUrl } from "@/components/photo/photoUtils";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * いいねした写真・動画のストック(行きたい場所のメモ)。場所名・住所・ルート案内を並べ、
 * タップで全画面表示。「いいね解除」でストックから外せる。
 */
export function LikedPhotoList({ posts: initial }: { posts: PhotoPost[] }) {
  const { t } = useLocale();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const posts = initial.filter((p) => !removed.has(p.id));

  async function unlike(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      // いいねのON/OFFはトグルAPI。このリストの写真は全部いいね済みなので、押すと解除になる。
      const res = await fetch(`/api/photo/posts/${id}/like`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { liked?: boolean };
        // 解除できたものだけ一覧から外す(別の端末ですでに解除済みで、押して再度付いた場合は残す)。
        if (data.liked === false) setRemoved((prev) => new Set(prev).add(id));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <ul className="space-y-3">
        {posts.map((p, i) => (
          <li key={p.id} className="flex gap-3 rounded-xl border border-main/10 bg-main/[0.03] p-3">
            <button type="button" onClick={() => setOpenIndex(i)} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoResized(p.imageUrl, 240, true)} alt={p.spotName} loading="lazy" className="h-full w-full object-cover" />
              {p.videoUrl && (
                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
                  <Play size={11} className="fill-white" />
                </span>
              )}
            </button>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-sm font-medium text-main">{p.placeName || p.spotName}</p>
              {p.address && (
                <p className="flex items-start gap-1 text-[11px] text-tone-500">
                  <MapPin size={11} className="mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{p.address}</span>
                </p>
              )}
              <div className="flex items-center gap-4 pt-1 text-xs">
                <a href={photoRouteUrl(p)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent hover:underline">
                  <Navigation size={13} />
                  {t.photo.directions}
                </a>
                <button type="button" onClick={() => unlike(p.id)} disabled={busyId === p.id} className="text-tone-500 hover:text-main disabled:opacity-50">
                  {t.mypage.unlikePhoto}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {openIndex !== null && (
        <PhotoFullscreen
          posts={posts}
          index={Math.min(openIndex, posts.length - 1)}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          onDeleted={(id) => {
            setRemoved((prev) => new Set(prev).add(id));
            setOpenIndex(null);
          }}
        />
      )}
    </>
  );
}

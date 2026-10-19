"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { PhotoFullscreen } from "@/components/photo/PhotoFullscreen";
import { photoResized } from "@/components/photo/photoUtils";

/** 店舗ごとの「みんなの写真」の格子。タップで全画面表示(左右で前後の写真)。 */
export function ShopUserPhotoGrid({ posts: allPosts }: { posts: PhotoPost[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // 削除した写真はその場で一覧から外す(本人とルート管理者だけに削除ボタンが出る)。
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const posts = allPosts.filter((p) => !deleted.has(p.id));
  return (
    <>
      <div className="grid grid-cols-3 gap-[2px] sm:grid-cols-4 md:grid-cols-6">
        {posts.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="relative aspect-square overflow-hidden bg-tone-900"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoResized(p.imageUrl, 360, true)} alt={p.spotName} loading="lazy" className="h-full w-full object-cover" />
            {p.videoUrl && (
              <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
                <Play size={11} className="fill-white" />
              </span>
            )}
          </button>
        ))}
      </div>
      {openIndex !== null && (
        <PhotoFullscreen
          posts={posts}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          onDeleted={(id) => {
            setDeleted((prev) => new Set(prev).add(id));
            setOpenIndex(null);
          }}
        />
      )}
    </>
  );
}

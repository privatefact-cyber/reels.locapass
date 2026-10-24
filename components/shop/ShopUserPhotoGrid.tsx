"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { PhotoFullscreen } from "@/components/photo/PhotoFullscreen";
import { PhotoLikeButton } from "@/components/photo/PhotoLikeButton";
import { photoResized } from "@/components/photo/photoUtils";

/**
 * 店舗ごとのユーザーPHOTO。タップで全画面表示(左右で前後の写真)。
 * layout="slider": 横スライド(店舗ページ用) / "grid": 縦に並べる一覧(一覧ページ用)。
 * 一覧(grid)の各写真には小さないいねを付ける。シェアは全画面表示から行う。
 */
export function ShopUserPhotoGrid({
  posts: allPosts,
  layout = "grid",
  shareUrl,
}: {
  posts: PhotoPost[];
  layout?: "slider" | "grid";
  /** シェアするページのURL(店舗の写真一覧)。未指定なら今のページ。 */
  shareUrl?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // 削除した写真はその場で一覧から外す(本人とルート管理者だけに削除ボタンが出る)。
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const posts = allPosts.filter((p) => !deleted.has(p.id));

  // slider: 店舗ページ用。60px角の小さなサムネイルを横に流す(他の情報を押し下げないため)。
  // grid: 写真一覧用。スマホは3列、PCは80px角を基準に幅いっぱいに並べる。
  const slider = layout === "slider";
  const listClass = slider
    ? "-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    : "grid grid-cols-3 gap-[2px] md:grid-cols-[repeat(auto-fill,minmax(80px,1fr))]";
  const cardClass = slider ? "h-[60px] w-[60px] shrink-0" : "min-w-0";
  const rounded = slider ? "rounded-md" : "";

  return (
    <>
      <div className={listClass}>
        {posts.map((p, i) => (
          <div key={p.id} className={`relative aspect-square overflow-hidden bg-tone-900 ${rounded} ${cardClass}`}>
            <button type="button" onClick={() => setOpenIndex(i)} className="block h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoResized(p.imageUrl, slider ? 180 : 360, true)} alt={p.spotName} loading="lazy" className="h-full w-full object-cover" />
            </button>
            {p.videoUrl && (
              <span className={`pointer-events-none absolute right-1 top-1 flex ${slider ? "h-4 w-4" : "h-5 w-5"} items-center justify-center rounded-full bg-black/60 text-white`}>
                <Play size={slider ? 9 : 11} className="fill-white" />
              </span>
            )}
            {/* 一覧(grid)だけ、左下に小さくいいね。サムネイルが小さい店舗ページの横スクロールでは出さない(全画面表示から押せる)。 */}
            {!slider && (
              <div className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
                <PhotoLikeButton postId={p.id} initialCount={p.likeCount} />
              </div>
            )}
          </div>
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

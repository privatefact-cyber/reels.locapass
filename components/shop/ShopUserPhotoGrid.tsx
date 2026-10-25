"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Play } from "lucide-react";
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { PhotoLikeButton } from "@/components/photo/PhotoLikeButton";
import { photoResized } from "@/components/photo/photoUtils";

// 重い地図・投稿ビューは、サムネイルを開いたときだけ読み込む。
const PhotoFeed = dynamic(() => import("@/components/photo/PhotoFeed").then((mod) => mod.PhotoFeed), { ssr: false });

/**
 * 店舗ごとのユーザーPHOTO。タップでLOCA SNAP本体と同じ縦スクロール投稿ビューを開く。
 * layout="slider": 横スライド(店舗ページ用) / "grid": 縦に並べる一覧(一覧ページ用)。
 * 一覧(grid)の各写真には小さないいねを付ける。コメント・動画・シェアは投稿ビューに表示する。
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

  // 投稿ビューを開いている間は背面の店舗ページを固定する。Escでも閉じられるようにする。
  useEffect(() => {
    if (openIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenIndex(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openIndex]);

  // slider: 店舗ページ用。60px角の小さなサムネイルを横に流す(他の情報を押し下げないため)。
  // grid: 写真一覧用。スマホは3列、PCは80px角を基準に幅いっぱいに並べる。
  const slider = layout === "slider";
  const listClass = slider
    ? "-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    : "grid w-full grid-cols-3 gap-[2px] md:mx-auto md:max-w-7xl md:grid-cols-[repeat(auto-fill,minmax(80px,1fr))]";
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
      {openIndex !== null && posts[openIndex] && typeof document !== "undefined"
        ? createPortal(
            <div role="dialog" aria-modal="true" aria-label={posts[openIndex].spotName} className="fixed inset-0 z-[1000] overflow-y-auto bg-page">
              <PhotoFeed
                key={posts[openIndex].id}
                posts={posts}
                areas={[]}
                areaSlug={null}
                hideToolbar
                initialPostId={posts[openIndex].id}
                onCloseDetail={() => setOpenIndex(null)}
                onPostDeleted={(id) => setDeleted((prev) => new Set(prev).add(id))}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

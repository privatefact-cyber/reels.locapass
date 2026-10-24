"use client";

import { useEffect, useState } from "react";
import { Play, Share2 } from "lucide-react";
import { sharePhoto } from "@/components/photo/sharePhoto";
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { PhotoFullscreen } from "@/components/photo/PhotoFullscreen";
import { PhotoLikeButton } from "@/components/photo/PhotoLikeButton";
import { photoResized } from "@/components/photo/photoUtils";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * 店舗ごとのユーザーPHOTO。タップで全画面表示(左右で前後の写真)。
 * layout="slider": 横スライド(店舗ページ用) / "grid": 縦に並べる一覧(一覧ページ用)。
 * 各写真に、いいねとシェアのボタンを付ける(PHOTOページと同じ)。
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
  const { t } = useLocale();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // 削除した写真はその場で一覧から外す(本人とルート管理者だけに削除ボタンが出る)。
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const posts = allPosts.filter((p) => !deleted.has(p.id));

  useEffect(() => {
    if (!copiedId) return;
    const timer = window.setTimeout(() => setCopiedId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  async function share(post: PhotoPost) {
    if (await sharePhoto(post)) setCopiedId(post.id);
  }

  const listClass =
    layout === "slider"
      ? "-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      : "grid grid-cols-3 gap-[2px] lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]";
  const cardClass = layout === "slider" ? "w-40 shrink-0 snap-start sm:w-48" : "min-w-0";
  const rounded = layout === "slider" ? "rounded-lg" : "";

  return (
    <>
      <div className={listClass}>
        {posts.map((p, i) => (
          <div key={p.id} className={`relative aspect-square overflow-hidden bg-tone-900 ${rounded} ${cardClass}`}>
            <button type="button" onClick={() => setOpenIndex(i)} className="block h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoResized(p.imageUrl, 360, true)} alt={p.spotName} loading="lazy" className="h-full w-full object-cover" />
            </button>
            {p.videoUrl && (
              <span className="pointer-events-none absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
                <Play size={11} className="fill-white" />
              </span>
            )}
            {/* 左下にいいね、右下にシェア。サムネイルの上に重ねて押しやすくする */}
            <div className="absolute bottom-1 left-1 rounded-full bg-black/55 px-2 py-1 text-xs text-white backdrop-blur-sm">
              <PhotoLikeButton postId={p.id} initialCount={p.likeCount} />
            </div>
            <button
              type="button"
              onClick={() => share(p)}
              aria-label={t.common.share}
              className="absolute bottom-1 right-1 flex items-center gap-1 rounded-full bg-black/55 p-1.5 text-xs text-white backdrop-blur-sm"
            >
              <Share2 size={14} />
              {copiedId === p.id ? t.common.linkCopied : null}
            </button>
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

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Maximize2, MapPin, Navigation, Play } from "lucide-react";
import type { PhotoArea, PhotoPost } from "@/lib/photo/getPhotoPosts";
import { PhotoMap } from "@/components/photo/PhotoMap";
import { PhotoSpotList } from "@/components/photo/PhotoSpotList";
import { PhotoLikeButton } from "@/components/photo/PhotoLikeButton";
import { PhotoFullscreen } from "@/components/photo/PhotoFullscreen";
import { PhotoDeleteButton } from "@/components/photo/PhotoDeleteButton";
import { PhotoVideo } from "@/components/photo/PhotoVideo";
import { photoResized, photoRouteUrl } from "@/components/photo/photoUtils";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { areaLabel, dateLocaleTag, tagLabel } from "@/lib/photo/labels";

function PlaceBadge({ kind }: { kind: PhotoPost["placeKind"] }) {
  const { t } = useLocale();
  if (kind !== "listed" && kind !== "spot") return null;
  return (
    <span className="rounded-full border border-tone-600 px-2 py-0.5 text-[10px] text-tone-300">
      {kind === "listed" ? t.photo.badgeListed : t.photo.badgeSpot}
    </span>
  );
}

function Avatar({ post }: { post: PhotoPost }) {
  return post.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={post.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
  ) : (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tone-800 text-xs text-tone-300">
      {post.userName.slice(0, 1)}
    </span>
  );
}

export function PhotoFeed({
  posts: allPosts,
  areas,
  areaSlug,
  initialView = "grid",
  initialPostId,
}: {
  posts: PhotoPost[];
  areas: PhotoArea[];
  areaSlug: string | null;
  initialView?: "grid" | "map" | "spots";
  /** 通知などからの直リンク: この写真を最初から縦ビューアで開く。 */
  initialPostId?: string;
}) {
  // ビューアに出す写真の並び。格子からは全体の中のその1枚から、マップのカードからは
  // そのカード(同じ場所)の写真だけを出す。
  const { t, locale } = useLocale();
  // 削除した写真はその場で一覧から外す(本人とルート管理者だけに削除ボタンが出る)。
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const posts = allPosts.filter((p) => !deleted.has(p.id));
  const [viewer, setViewer] = useState<{ posts: PhotoPost[]; index: number; title: string | null; mode: "grid" | "detail" } | null>(() => {
    if (!initialPostId) return null;
    const index = posts.findIndex((p) => p.id === initialPostId);
    return index >= 0 ? { posts, index, title: null, mode: "detail" } : null;
  });
  const [view, setView] = useState<"grid" | "map" | "spots">(initialView);
  // フルスクリーン表示中の写真(ビューアの並びの中の番号)。nullなら閉じている。
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const openRef = useRef<HTMLDivElement | null>(null);

  // 開いた投稿の位置までスクロールして、そこから縦に見ていけるようにする。
  useEffect(() => {
    if (viewer) openRef.current?.scrollIntoView({ block: "start" });
  }, [viewer]);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs ${
      active ? "border-main bg-main text-on-accent" : "border-tone-700 text-tone-300 hover:text-main"
    }`;

  // マップのカードから開いたとき(title付き)は、まずその場所の写真をグリッドで一覧してから、
  // 見たい写真をタップして縦のビューアに進む(写真が多いと縦だけでは全部に辿り着けないため)。
  if (viewer && viewer.title && viewer.mode === "grid") {
    return (
      <div className="space-y-3 pb-10">
        <button
          type="button"
          onClick={() => setViewer(null)}
          className="flex items-center gap-1 px-3 pt-2 text-sm text-tone-300 hover:text-main"
        >
          <ChevronLeft size={18} />
          {t.photo.backToMap}
        </button>
        <p className="px-3 text-sm font-medium text-main">
          {viewer.title}
          <span className="ml-2 text-xs font-normal text-tone-500">{t.photo.count(viewer.posts.length)}</span>
        </p>
        <div className="grid grid-cols-3 gap-[1px] sm:landscape:grid-cols-4 sm:portrait:grid-cols-6 md:landscape:grid-cols-6 md:gap-[2px] md:max-w-7xl md:mx-auto lg:landscape:grid-cols-8">
          {viewer.posts.map((post, index) => (
            <button
              key={post.id}
              type="button"
              onClick={() => setViewer({ ...viewer, index, mode: "detail" })}
              className="relative aspect-square overflow-hidden bg-tone-900"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoResized(post.imageUrl, 360, true)} alt={post.spotName} loading="lazy" className="h-full w-full object-cover" />
              {post.videoUrl ? (
                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white" aria-label={t.photo.badgeVideo}>
                  <Play size={11} className="fill-white" />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (viewer) {
    return (
      <div className="space-y-6 pb-10">
        <button
          type="button"
          onClick={() => setViewer(viewer.title ? { ...viewer, mode: "grid" } : null)}
          className="flex items-center gap-1 px-3 pt-2 text-sm text-tone-300 hover:text-main"
        >
          <ChevronLeft size={18} />
          {viewer.title ? t.photo.backToList : t.photo.backToGrid}
        </button>
        {viewer.title ? <p className="px-3 text-sm font-medium text-main">{viewer.title}</p> : null}
        {viewer.posts.map((post, index) => (
          <article key={post.id} ref={index === viewer.index ? openRef : undefined} className="scroll-mt-[104px]">
            {/* アイコン・名前をタップすると、その人のページ(投稿一覧とプロフィール)へ。 */}
            {post.memberId ? (
              <Link href={`/photo/u/${post.memberId}`} className="flex items-center gap-2 px-3 pb-2">
                <Avatar post={post} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-main">{post.userName}</p>
                  <p className="text-[11px] text-tone-500">{new Date(post.createdAt).toLocaleDateString(dateLocaleTag(locale))}</p>
                </div>
              </Link>
            ) : (
              <div className="flex items-center gap-2 px-3 pb-2">
                <Avatar post={post} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-main">{post.userName}</p>
                  <p className="text-[11px] text-tone-500">{new Date(post.createdAt).toLocaleDateString(dateLocaleTag(locale))}</p>
                </div>
              </div>
            )}
            {post.videoUrl ? (
              // 動画投稿: 画面に映ったら無音で自動再生(リールと同じ)。全画面・音はプレーヤー標準のコントロール。
              <PhotoVideo src={post.videoUrl} poster={photoResized(post.imageUrl, 1080, false)} label={post.spotName} />
            ) : (
              <div className="relative md:mx-auto md:w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoResized(post.imageUrl, 1080, false)} alt={post.spotName} loading="lazy" className="w-full bg-tone-900 object-contain md:mx-auto md:max-h-[80dvh] md:w-auto" />
                <button
                  type="button"
                  onClick={() => setFullscreenIndex(index)}
                  aria-label={t.photo.fullscreen}
                  className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75"
                >
                  <Maximize2 size={18} />
                </button>
              </div>
            )}
            <div className="space-y-2 px-3 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-medium text-main">{post.spotName}</p>
                <PlaceBadge kind={post.placeKind} />
              </div>
              {post.comment ? <p className="whitespace-pre-wrap text-sm text-tone-300">{post.comment}</p> : null}
              {post.tags.length > 0 ? (
                <p className="text-xs text-tone-500">{post.tags.map((tag) => `#${tagLabel(tag, t.photo)}`).join(" ")}</p>
              ) : null}
              {post.address ? (
                <p className="flex items-start gap-1 text-xs text-tone-500">
                  <MapPin size={12} className="mt-0.5 shrink-0" />
                  {post.address}
                </p>
              ) : null}
              <div className="flex items-center gap-4 pt-1 text-sm text-tone-300">
                <PhotoLikeButton postId={post.id} initialCount={post.likeCount} />
                <PhotoDeleteButton
                  post={post}
                  onDeleted={(id) => {
                    setDeleted((prev) => new Set(prev).add(id));
                    setViewer(null);
                    setFullscreenIndex(null);
                  }}
                />
                <a
                  href={photoRouteUrl(post)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-main"
                >
                  <Navigation size={16} />
                  {t.photo.directions}
                </a>
              </div>
            </div>
          </article>
        ))}
        {fullscreenIndex !== null ? (
          <PhotoFullscreen
            posts={viewer.posts}
            index={fullscreenIndex}
            onIndexChange={setFullscreenIndex}
            onClose={() => setFullscreenIndex(null)}
            onDeleted={(id) => {
              setDeleted((prev) => new Set(prev).add(id));
              setViewer(null);
              setFullscreenIndex(null);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {areas.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-3 pt-2">
          <Link href="/photo" className={chip(!areaSlug)}>
            {t.photo.allAreas}
          </Link>
          {areas.map((a) => (
            <Link key={a.slug} href={`/photo?area=${encodeURIComponent(a.slug)}`} className={chip(areaSlug === a.slug)}>
              {areaLabel(a, locale, t.photo)}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2 px-3">
        <button type="button" onClick={() => setView("grid")} className={chip(view === "grid")}>
          {t.photo.viewGrid}
        </button>
        <button type="button" onClick={() => setView("map")} className={chip(view === "map")}>
          {t.photo.viewMap}
        </button>
        <button type="button" onClick={() => setView("spots")} className={chip(view === "spots")}>
          {t.photo.viewSpots}
        </button>
        <Link
          href="/photo/new"
          className="ml-auto shrink-0 rounded-full bg-cta-light px-4 py-1.5 text-xs font-bold tracking-wide text-on-cta-gold transition hover:bg-cta-hover"
        >
          {t.photo.postButton}
        </Link>
      </div>

      {view === "spots" ? (
        <PhotoSpotList posts={posts} areas={areas} onOpenSpot={(spotPosts, index, title) => setViewer({ posts: spotPosts, index, title, mode: index === 0 ? "grid" : "detail" })} />
      ) : view === "map" ? (
        <PhotoMap posts={posts} onOpenSpot={(spotPosts, index, title) => setViewer({ posts: spotPosts, index, title, mode: "grid" })} />
      ) : posts.length === 0 ? (
        <p className="px-2 py-10 text-center text-sm text-tone-500">{t.photo.empty}</p>
      ) : (
        <div className="grid grid-cols-3 gap-[1px] sm:landscape:grid-cols-4 sm:portrait:grid-cols-6 md:landscape:grid-cols-6 md:gap-[2px] md:max-w-7xl md:mx-auto lg:landscape:grid-cols-8">
          {posts.map((post, index) => (
            <button
              key={post.id}
              type="button"
              onClick={() => setViewer({ posts, index, title: null, mode: "detail" })}
              className="relative aspect-square overflow-hidden bg-tone-900"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoResized(post.imageUrl, 360, true)} alt={post.spotName} loading="lazy" className="h-full w-full object-cover" />
              {post.videoUrl ? (
                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white" aria-label={t.photo.badgeVideo}>
                  <Play size={11} className="fill-white" />
                </span>
              ) : null}
              {post.placeKind === "listed" || post.placeKind === "spot" ? (
                <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                  {post.placeKind === "listed" ? t.photo.badgeListed : t.photo.badgeSpot}
                </span>
              ) : null}
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] text-white">
                {post.spotName}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

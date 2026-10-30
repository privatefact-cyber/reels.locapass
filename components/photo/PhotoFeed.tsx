"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Maximize2, MapPin, Navigation, Play, Search, Store } from "lucide-react";
import { PhotoShareButton } from "@/components/photo/PhotoShareButton";
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
import { showOriginalLabel, showTranslationLabel } from "@/lib/i18n/originalLabel";

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
  hideToolbar = false,
  onCloseDetail,
  onPostDeleted,
}: {
  posts: PhotoPost[];
  areas: PhotoArea[];
  areaSlug: string | null;
  initialView?: "grid" | "map" | "spots";
  /** 通知などからの直リンク: この写真を最初から縦ビューアで開く。 */
  initialPostId?: string;
  /** グリッド/マップの切り替えと「写真を投稿」を出さない(マイページの「いいね写真」など、格子と縦ビューアだけで使うとき)。 */
  hideToolbar?: boolean;
  /** 店舗ページなど、外側のモーダルから詳細を開いたときの閉じる処理。 */
  onCloseDetail?: () => void;
  /** 外側の一覧にも削除結果を反映するときに呼ぶ。 */
  onPostDeleted?: (postId: string) => void;
}) {
  // ビューアに出す写真の並び。格子からは全体の中のその1枚から、マップのカードからは
  // そのカード(同じ場所)の写真だけを出す。
  const { t, locale } = useLocale();
  // 削除した写真はその場で一覧から外す(本人とルート管理者だけに削除ボタンが出る)。
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  // 文章が4言語以外(ポルトガル語など)で書かれた投稿は、「原文を見る」で書かれたままの文章に切り替える(画面の中だけ。翻訳費用はかからない)。
  const [originalIds, setOriginalIds] = useState<Set<string>>(new Set());
  const visiblePosts = useMemo(() => allPosts.filter((p) => !deleted.has(p.id)), [allPosts, deleted]);

  // 検索(虫眼鏡)とタグでの絞り込み。グリッド・マップ・穴場のどのビューでも同じ条件を使う。
  // タグは投稿時にAIが自動で付けたもの。複数選ぶと、どれかに当てはまる写真を出す。
  const [keyword, setKeyword] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const tagChoices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of visiblePosts) for (const tag of p.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }, [visiblePosts]);
  const posts = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return visiblePosts.filter((p) => {
      if (activeTags.length > 0 && !p.tags.some((tag) => activeTags.includes(tag))) return false;
      if (!q) return true;
      const haystack = [p.spotName, p.placeName, p.comment, p.address, p.userName, ...p.tags.map((tag) => tagLabel(tag, t.photo)), ...p.tags]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [visiblePosts, keyword, activeTags, t]);
  const anyFilterActive = keyword.trim() !== "" || activeTags.length > 0;
  const resetFilters = () => {
    setKeyword("");
    setActiveTags([]);
  };
  const toggleTag = (tag: string) => setActiveTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  // 検索パネルはEscで閉じる。
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);
  const [viewer, setViewer] = useState<{ posts: PhotoPost[]; index: number; title: string | null; mode: "grid" | "detail" } | null>(() => {
    if (!initialPostId) return null;
    const index = posts.findIndex((p) => p.id === initialPostId);
    return index >= 0 ? { posts, index, title: null, mode: "detail" } : null;
  });
  // ビューアは開いた時点の投稿を持つので、言語切替で届いた最新の翻訳版に差し替えて表示する
  const latestById = useMemo(() => new Map(allPosts.map((p) => [p.id, p])), [allPosts]);
  const viewerPosts = useMemo(
    () => (viewer ? viewer.posts.map((p) => latestById.get(p.id) ?? p) : []),
    [viewer, latestById],
  );
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
          <span className="ml-2 text-xs font-normal text-tone-500">{t.photo.count(viewerPosts.length)}</span>
        </p>
        <div className="grid grid-cols-3 gap-[1px] sm:landscape:grid-cols-4 sm:portrait:grid-cols-6 md:landscape:grid-cols-6 md:gap-[2px] md:max-w-7xl md:mx-auto lg:landscape:grid-cols-8">
          {viewerPosts.map((post, index) => (
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
          onClick={() => {
            if (onCloseDetail) onCloseDetail();
            else setViewer(viewer.title ? { ...viewer, mode: "grid" } : null);
          }}
          className={`flex items-center gap-1 px-3 pt-2 text-sm text-tone-300 hover:text-main ${
            onCloseDetail ? "sticky top-0 z-20 w-full bg-page/90 py-3 backdrop-blur-md" : ""
          }`}
        >
          <ChevronLeft size={18} />
          {onCloseDetail ? t.photo.close : viewer.title ? t.photo.backToList : t.photo.backToGrid}
        </button>
        {viewer.title ? <p className="px-3 text-sm font-medium text-main">{viewer.title}</p> : null}
        {viewerPosts.map((post, index) => (
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
            {/* 写真と操作行を同じ幅の箱に入れる(PCで写真が中央寄せのとき、操作行の右端を写真の右端にそろえる) */}
            <div className="md:mx-auto md:w-fit">
            {post.videoUrl ? (
              // 動画投稿: 画面に映ったら無音で自動再生(リールと同じ)。全画面・音はプレーヤー標準のコントロール。
              <div className="relative md:mx-auto md:w-fit">
                <PhotoVideo src={post.videoUrl} poster={photoResized(post.imageUrl, 1080, false)} label={post.spotName} />
                <div className="absolute bottom-12 right-2 rounded-full bg-black/55 px-3 py-1.5 text-sm text-white backdrop-blur-sm">
                  <PhotoLikeButton postId={post.id} initialCount={post.likeCount} />
                </div>
              </div>
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
                <div className="absolute bottom-2 right-2 rounded-full bg-black/55 px-3 py-1.5 text-sm text-white backdrop-blur-sm">
                  <PhotoLikeButton postId={post.id} initialCount={post.likeCount} />
                </div>
              </div>
            )}
            <div className="flex items-center justify-end gap-5 border-b border-tone-800 px-3 py-2.5 text-sm text-tone-300">
              <PhotoDeleteButton
                  post={post}
                  onDeleted={(id) => {
                    setDeleted((prev) => new Set(prev).add(id));
                    onPostDeleted?.(id);
                    if (onCloseDetail) onCloseDetail();
                    else setViewer(null);
                    setFullscreenIndex(null);
                  }}
                />
                <PhotoShareButton post={post} />
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
            <div className="space-y-2 px-3 pt-3">
              {(() => {
                const orig = post.original;
                // 翻訳が付く前(原文と同じ文)は、切替が要らない。
                const canToggle = !!orig && (orig.spotName !== post.spotName || (orig.comment ?? "") !== (post.comment ?? "") || (orig.address ?? "") !== (post.address ?? ""));
                const showOrig = canToggle && originalIds.has(post.id);
                const spotName = showOrig ? orig!.spotName : post.spotName;
                const comment = showOrig ? orig!.comment : post.comment;
                const address = showOrig ? orig!.address : post.address;
                return (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {post.shop ? (
                        <Link href={post.shop.href} className="flex items-center gap-1 text-base font-medium text-main underline decoration-main/40 underline-offset-4 hover:decoration-main">
                          <Store size={16} className="shrink-0" />
                          {spotName}
                        </Link>
                      ) : (
                        <p dir="auto" className="text-base font-medium text-main">{spotName}</p>
                      )}
                      <PlaceBadge kind={post.placeKind} />
                    </div>
                    {comment ? <p dir="auto" className="whitespace-pre-wrap text-sm text-tone-300">{comment}</p> : null}
                    {canToggle ? (
                      <button
                        type="button"
                        onClick={() =>
                          setOriginalIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(post.id)) next.delete(post.id);
                            else next.add(post.id);
                            return next;
                          })
                        }
                        className="rounded-full border border-main/25 px-2.5 py-0.5 text-[11px] font-semibold text-tone-300 hover:border-main/50 hover:text-main"
                      >
                        🌐 {showOrig ? showTranslationLabel(locale) : showOriginalLabel(locale, orig!.lang)}
                      </button>
                    ) : null}
                    {post.tags.length > 0 ? (
                      <p className="text-xs text-tone-500">{post.tags.map((tag) => `#${tagLabel(tag, t.photo)}`).join(" ")}</p>
                    ) : null}
                    {address ? (
                      <p dir="auto" className="flex items-start gap-1 text-xs text-tone-500">
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        {address}
                      </p>
                    ) : null}
                  </>
                );
              })()}
            </div>
          </article>
        ))}
        {fullscreenIndex !== null ? (
          <PhotoFullscreen
            posts={viewerPosts}
            index={fullscreenIndex}
            onIndexChange={setFullscreenIndex}
            onClose={() => setFullscreenIndex(null)}
            onDeleted={(id) => {
              setDeleted((prev) => new Set(prev).add(id));
              onPostDeleted?.(id);
              if (onCloseDetail) onCloseDetail();
              else setViewer(null);
              setFullscreenIndex(null);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 検索(虫眼鏡)・タグ・表示切り替えは、ヘッダー直下に固定する。グリッド・マップ・穴場のどれでも使える。 */}
      <div className="sticky top-[calc(81px+env(safe-area-inset-top))] z-30 -mx-0 space-y-2 border-b border-main/5 bg-tone-950/90 px-1 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={t.nav.search}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition hover:border-accent hover:text-accent ${
              keyword.trim() ? "border-accent text-accent" : "border-tone-700 text-tone-300"
            }`}
          >
            <Search size={16} />
          </button>
          <div className="flex flex-1 gap-2 overflow-x-auto no-scrollbar">
            {keyword.trim() ? (
              <button type="button" onClick={() => setKeyword("")} className={`${chip(true)} inline-flex items-center gap-1 whitespace-nowrap`}>
                {keyword.trim()}
                <span aria-hidden>✕</span>
              </button>
            ) : null}
            {tagChoices.map((tag) => (
              <button key={tag} type="button" onClick={() => toggleTag(tag)} className={`${chip(activeTags.includes(tag))} whitespace-nowrap`}>
                {tagLabel(tag, t.photo)}
              </button>
            ))}
          </div>
        </div>
        {hideToolbar ? null : (
          <div className="flex items-center gap-2">
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
        )}
      </div>

      {searchOpen && (
        // 背景のどこをタップしても閉じる。パネル内のタップは背景に伝えない(入力中に閉じないように)。
        <div onClick={() => setSearchOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-main/10 bg-surface/95 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-main">{t.nav.search}</h2>
              <button type="button" onClick={() => setSearchOpen(false)} aria-label={t.common.close} className="text-muted hover:text-main">
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-tone-700 bg-main/5 px-3 py-2">
              <Search size={16} className="shrink-0 text-muted" />
              <input
                autoFocus
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSearchOpen(false);
                }}
                placeholder={t.feed.searchPlaceholder}
                className="w-full min-w-0 bg-transparent text-[16px] text-main placeholder:text-tone-500 focus:outline-none"
              />
            </div>
            {anyFilterActive && (
              <button type="button" onClick={resetFilters} className="mx-auto mt-3 block text-xs text-accent underline">
                {t.feed.resetFilters}
              </button>
            )}
          </div>
        </div>
      )}

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

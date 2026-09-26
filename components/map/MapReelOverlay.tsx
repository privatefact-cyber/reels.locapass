"use client";

import { PlacePhotoCredit } from "@/components/shop/PlacePhotoCredit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { ReelCard } from "@/components/ReelCard";
import { useActiveReelIndex } from "@/lib/reels/useActiveReelIndex";
import { useReelLikes } from "@/lib/reels/useReelLikes";
import { useCastFollows, useShopFavorites } from "@/lib/reels/useFollows";
import { reelCtaUrl } from "@/lib/reels/links";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { ReelItem } from "@/lib/reels/types";
import type { VenueCardData } from "@/types/venue";

export type CardRect = { top: number; left: number; width: number; height: number };

/** 開閉アニメーションの長さ(ms)。 */
const ANIM_MS = 320;
/** 残りこの本数を切ったら、次の店舗のリールを先に読み込んでおく。 */
const PRELOAD_REMAINING = 2;

type Segment = { venue: VenueCardData; reels: ReelItem[] };

/** カードの位置から画面全体へ広がる(戻るときは縮む)clip-path。中身を歪ませずに切り抜きだけを動かす。 */
function clipFor(rect: CardRect | null): string {
  if (!rect || typeof window === "undefined") return "inset(0px 0px 0px 0px round 0px)";
  const right = Math.max(0, window.innerWidth - rect.left - rect.width);
  const bottom = Math.max(0, window.innerHeight - rect.top - rect.height);
  return `inset(${Math.max(0, rect.top)}px ${right}px ${bottom}px ${Math.max(0, rect.left)}px round 16px)`;
}

/**
 * マップのカードから開く全画面リール。
 *
 * - 別ページに遷移せずマップの上に重ねる。遷移すると戻ったときに地図の初期化(タイル再読み込み)と
 *   表示位置のリセットが起きるため。
 * - タップしたカードの位置から画面いっぱいに広がり、閉じるときは「いま見ている店舗」のカードへ縮んで戻る。
 * - 店舗のリールを見終わったら、カルーセルの隣の店舗(リールがある店舗だけ)へそのまま続く。
 *   背後のカルーセルと地図も、いま見ている店舗に追従させる(閉じたときにその店舗が選ばれた状態になる)。
 * - スマホの戻る操作で閉じられるよう、開いたときに履歴を1つ積む。
 */
export function MapReelOverlay({
  venues,
  startVenueId,
  getCardRect,
  onActiveVenueChange,
  onClosed,
}: {
  /** 開いた時点のカルーセルの並び。背後で取り直しが起きても順番が変わらないよう最初に固定する。 */
  venues: VenueCardData[];
  startVenueId: string;
  getCardRect: (venueId: string) => CardRect | null;
  onActiveVenueChange: (venueId: string) => void;
  onClosed: () => void;
}) {
  const { t } = useLocale();

  // タップした店舗から後ろの、リールがある店舗だけを順に流す。
  const [queue] = useState(() => {
    const start = Math.max(0, venues.findIndex((v) => v.id === startVenueId));
    return venues.slice(start).filter((v, i) => i === 0 || v.reelCount > 0);
  });

  const [segments, setSegments] = useState<Segment[]>([]);
  const [nextQueueIndex, setNextQueueIndex] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const loadingRef = useRef(false);

  const [clipPath, setClipPath] = useState(() => clipFor(getCardRect(startVenueId)));
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  const items = useMemo(
    () => segments.flatMap((s) => s.reels.map((reel) => ({ reel, venueId: s.venue.id }))),
    [segments],
  );
  const allReels = useMemo(() => items.map((i) => i.reel), [items]);

  const { activeIndex, registerItem } = useActiveReelIndex(items.length + (exhausted ? 1 : 0));
  const { liked, likeCounts, toggleLike } = useReelLikes(allReels);
  const { followedCastIds, toggleCastFollow } = useCastFollows();
  const { favoritedShopIds, toggleShopFavorite } = useShopFavorites();

  /** キューの次の店舗のリールを読み込む。0件の店舗は飛ばし、キューが尽きたら終了カードを出す。 */
  const loadNext = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      let index = nextQueueIndex;
      while (index < queue.length) {
        const venue = queue[index];
        index += 1;
        try {
          const res = await fetch(`/api/venues/${venue.id}/reels`);
          if (!res.ok) continue;
          const { reels } = (await res.json()) as { reels: ReelItem[] };
          if (reels?.length) {
            setSegments((prev) => [...prev, { venue, reels }]);
            break;
          }
        } catch {
          // 1店舗の取得失敗で全体を止めない。次の店舗へ進む。
        }
      }
      setNextQueueIndex(index);
      if (index >= queue.length) setExhausted(true);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [nextQueueIndex, queue]);

  // 最初の店舗のリールを読み込む。
  useEffect(() => {
    void loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 開くアニメーション: カードの位置の切り抜きから、次のフレームで全画面へ広げる。
  // rAFはタブが非表示のときなどに呼ばれないことがあるので、setTimeoutでも確実に広げる
  // (呼ばれないとカードの大きさに切り抜かれたまま止まってしまう)。
  useEffect(() => {
    const expand = () => setClipPath(clipFor(null));
    const raf = requestAnimationFrame(expand);
    const timer = window.setTimeout(expand, 50);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);

  // 見終わりが近づいたら、次の店舗のぶんを先に読み込む。
  useEffect(() => {
    if (exhausted || loadingMore || items.length === 0) return;
    if (activeIndex >= items.length - PRELOAD_REMAINING) void loadNext();
  }, [activeIndex, items.length, exhausted, loadingMore, loadNext]);

  // 表示中の判定(IntersectionObserver)を待たずに、スクロール位置でも末尾の手前を検知して読み込む。
  // 一気に最後までスワイプされたときに、次の店舗が出てくるまで待たせないため。
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (exhausted || items.length === 0) return;
      const el = e.currentTarget;
      const remaining = el.scrollHeight - (el.scrollTop + el.clientHeight);
      if (remaining <= el.clientHeight * PRELOAD_REMAINING) void loadNext();
    },
    [exhausted, items.length, loadNext],
  );

  // いま見ている店舗を背後のカルーセル・地図に伝える。
  const activeVenueId = items[Math.min(activeIndex, items.length - 1)]?.venueId ?? startVenueId;
  const lastReportedVenue = useRef(startVenueId);
  useEffect(() => {
    if (activeVenueId === lastReportedVenue.current) return;
    lastReportedVenue.current = activeVenueId;
    onActiveVenueChange(activeVenueId);
  }, [activeVenueId, onActiveVenueChange]);

  /** 閉じるアニメーション: いま見ている店舗のカードへ縮めてから外す。 */
  const runClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setClipPath(clipFor(getCardRect(lastReportedVenue.current)));
    window.setTimeout(onClosed, ANIM_MS);
  }, [getCardRect, onClosed]);

  // スマホの戻る操作で閉じられるよう、開いたときに履歴を1つ積む。
  // ×・Escは history.back() を呼び、実際に閉じるのは popstate 側に一本化する。
  useEffect(() => {
    window.history.pushState({ luxelaMapReel: true }, "");
    const onPopState = () => runClose();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.history.back();
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [runClose]);

  const currentVenue = segments.find((s) => s.venue.id === activeVenueId)?.venue ?? queue[0];

  return (
    <div data-surface="media"
      className="fixed inset-0 z-[70] bg-black"
      style={{
        clipPath,
        transition: `clip-path ${ANIM_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity ${ANIM_MS}ms ease`,
        opacity: closing ? 0.85 : 1,
      }}
    >
      {/* 読み込み中は店舗の画像を敷いておく(広がるアニメーション中に真っ黒にならないように)。 */}
      {items.length === 0 && currentVenue?.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentVenue.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
      )}
      {items.length === 0 && currentVenue?.imageUrl && currentVenue.imageAttribution && (
        <div className="absolute bottom-3 left-3 z-10">
          <PlacePhotoCredit attribution={currentVenue.imageAttribution} />
        </div>
      )}

      <div
        onScroll={handleScroll}
        className="h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map(({ reel }, index) => {
          const media = reel.media[0];
          return (
            <div key={reel.id} ref={registerItem(index)} className="h-[100dvh] w-full snap-start snap-always">
              <ReelCard
                fullBleed
                reelId={reel.id}
                castId={reel.castId}
                commentsEnabled={reel.isCommentsEnabled}
                isActive={!closing && index === activeIndex}
                videoUrl={media?.type === "video" ? media.url : undefined}
                posterImageUrl={media?.type === "video" ? media.poster : media?.url}
                accountName={reel.castName}
                accountAvatarUrl={reel.castAvatarUrl ?? undefined}
                profileUrl={reel.castId ? `/cast/${reel.castId}` : `/shops/${reel.shopId}`}
                shopName={reel.shopName}
                createdAt={reel.createdAt}
                ctaUrl={reelCtaUrl(reel)}
                caption={reel.caption}
                likesCount={likeCounts[reel.id] ?? reel.likesCount}
                liked={liked.has(reel.id)}
                onToggleLike={() => toggleLike(reel.id)}
                followed={reel.castId ? followedCastIds.has(reel.castId) : favoritedShopIds.has(reel.shopId)}
                onToggleFollow={() =>
                  reel.castId ? toggleCastFollow(reel.castId) : toggleShopFavorite(reel.shopId)
                }
              />
            </div>
          );
        })}

        {exhausted && (
          <div
            ref={registerItem(items.length)}
            className="flex h-[100dvh] w-full snap-start flex-col items-center justify-center gap-4 px-8 text-center"
          >
            <p className="text-sm text-tone-300">{t.map.reelsEnd}</p>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="rounded-full border border-main/20 px-5 py-2 text-sm text-main hover:border-hl-400/60"
            >
              {t.common.close}
            </button>
          </div>
        )}
      </div>

      {items.length === 0 && !exhausted && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-main/80" />
        </div>
      )}

      {/* 上部: いま見ている店舗名と閉じるボタン。店舗が切り替わったことが分かるように常に出す。 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-[calc(env(safe-area-inset-top)+12px)]">
        <span className="truncate rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-main backdrop-blur">
          {currentVenue?.name}
        </span>
        <button
          type="button"
          onClick={() => window.history.back()}
          aria-label={t.common.close}
          className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/60 text-main backdrop-blur hover:bg-black/80"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

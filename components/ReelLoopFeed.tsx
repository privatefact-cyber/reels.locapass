"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useActiveReelIndex } from "@/lib/reels/useActiveReelIndex";
import { useReelLikes } from "@/lib/reels/useReelLikes";
import { reelCtaUrl, reelProfileUrl } from "@/lib/reels/links";
import { ReelCard } from "@/components/ReelCard";
import type { ReelItem } from "@/lib/reels/types";

const MAX_CYCLES = 50;
/** 今見ているカードの前後これだけの枚数だけ中身を描き、それ以外は同じ縦横比の空の枠にする(低価格の端末の負荷対策)。 */
const REEL_WINDOW = 4;

/**
 * 縦スワイプのリール一覧。最後まで見きったら先頭へ戻るのではなく、
 * 同じ並びをもう一周ぶん継ぎ足して下スワイプを続けられるようにする(永遠にループ)。
 * 全画面スワイプはトップのリール(ReelFeed)と同じ作り(カード右の「全画面」で入り、左上の×・Escで戻る)。
 */
export function ReelLoopFeed({ reels, loop = true }: { reels: ReelItem[]; /** falseなら継ぎ足さず、1周で終わる(1本だけの共有ページ用)。 */ loop?: boolean }) {
  const [cycles, setCycles] = useState(1);
  const idsKey = reels.map((r) => r.id).join(",");

  useEffect(() => {
    setCycles(1);
  }, [idsKey]);

  const loopedReels = useMemo(() => {
    if (!reels.length) return [];
    return Array.from({ length: cycles }, (_, cycleIndex) =>
      reels.map((r) => ({ reel: r, loopKey: `${r.id}__${cycleIndex}` })),
    ).flat();
  }, [reels, cycles]);

  const { activeIndex, registerItem } = useActiveReelIndex(loopedReels.length);
  const { liked, likeCounts, toggleLike } = useReelLikes(reels);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!reels.length || !loop) return;
    if (activeIndex >= loopedReels.length - 3) {
      setCycles((c) => Math.min(c + 1, MAX_CYCLES));
    }
  }, [activeIndex, loopedReels.length, reels.length, loop]);

  // 全画面スワイプ: ヘッダー・ボトムナビ・AIボタンを隠して、リールを画面いっぱいに縦スワイプする。
  // 隠すのはCSS(globals.cssの body[data-immersive] [data-chrome])。背景のページはスクロールさせない。
  const [immersive, setImmersive] = useState(false);
  const activeIndexRef = useRef(0);
  activeIndexRef.current = activeIndex;
  useEffect(() => {
    if (!immersive) return;
    document.body.dataset.immersive = "1";
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      delete document.body.dataset.immersive;
      document.body.style.overflow = prevOverflow;
    };
  }, [immersive]);
  // PC・Android・iPadでは、全画面スワイプに入るとき、ブラウザの全画面にもする(アドレスバー等が消える)。
  // iPhoneのSafariはページ全体の全画面に対応していないので、何もしない(ホーム画面に追加したPWAなら、もともとバーが無い)。
  // Escキー等でブラウザの全画面だけ解除されたときは、全画面スワイプも閉じる。
  useEffect(() => {
    if (!immersive) return;
    const root = document.documentElement;
    if (!root.requestFullscreen) return;
    let entered = false;
    root
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => {
        entered = true;
      })
      .catch(() => undefined);
    const onChange = () => {
      if (entered && !document.fullscreenElement) setImmersive(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, [immersive]);
  // 全画面に入る・出るときも、今見ているリールの位置のまま続ける(先頭に戻らない)。
  useLayoutEffect(() => {
    itemRefs.current[activeIndexRef.current]?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [immersive]);
  useEffect(() => {
    if (!immersive) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setImmersive(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [immersive]);

  if (!reels.length) {
    return <p className="px-2 py-10 text-center text-sm text-tone-500">投稿はまだありません。</p>;
  }

  return (
    <div className={immersive ? "fixed inset-0 z-[55] !m-0 snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black" : "space-y-4"}>
      {immersive && (
        <button
          type="button"
          onClick={() => setImmersive(false)}
          aria-label="全画面を閉じる"
          className="fixed left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] z-[56] flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-main backdrop-blur-sm"
        >
          <X size={18} />
        </button>
      )}
      {loopedReels.map(({ reel, loopKey }, index) => {
        const media = reel.media[0];
        return (
          // PC(md以上)では動画の縦横比(9:16)を保ったまま画面に収まるサイズに収める
          // (このwrapperが無いと、ReelCardのmd:h-full/w-autoが親の不定な高さのせいで
          // 効かず、幅いっぱいまで広がって縦長になりすぎる)。
          <div
            key={loopKey}
            ref={(el) => {
              itemRefs.current[index] = el;
              registerItem(index)(el);
            }}
            className={
              immersive
                ? "relative mx-auto h-[100dvh] w-full snap-start snap-always overflow-hidden bg-black md:flex md:items-center md:justify-center"
                : `mx-auto w-full md:flex md:h-[85dvh] md:[@media(max-height:500px)]:h-[100dvh] md:items-center md:justify-center ${
                    Math.abs(index - activeIndex) <= REEL_WINDOW ? "" : "aspect-[9/16] md:aspect-auto"
                  }`
            }
          >
            {Math.abs(index - activeIndex) > REEL_WINDOW ? null : (
            <ReelCard
              fullBleed={immersive}
              onEnterImmersive={() => setImmersive(true)}
              reelId={reel.id}
              castId={reel.castId}
              commentsEnabled={reel.isCommentsEnabled}
              embed={reel.embed}
              embedPreload={Math.abs(index - activeIndex) <= 1}
              isActive={index === activeIndex}
              videoUrl={media?.type === "video" ? media.url : undefined}
              posterImageUrl={media?.type === "video" ? media.poster : media?.url}
              accountName={reel.castName}
              accountAvatarUrl={reel.castAvatarUrl ?? undefined}
              profileUrl={reelProfileUrl(reel)}
              shopName={reel.shopName}
              createdAt={reel.createdAt}
              ctaUrl={reelCtaUrl(reel)}
              caption={reel.caption}
              captionOriginal={reel.captionOriginal}
              likesCount={likeCounts[reel.id] ?? reel.likesCount}
              liked={liked.has(reel.id)}
              onToggleLike={() => toggleLike(reel.id)}
            />
            )}
          </div>
        );
      })}
    </div>
  );
}

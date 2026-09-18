"use client";

import { useEffect, useMemo, useState } from "react";
import { useActiveReelIndex } from "@/lib/reels/useActiveReelIndex";
import { useReelLikes } from "@/lib/reels/useReelLikes";
import { reelCtaUrl } from "@/lib/reels/links";
import { ReelCard } from "@/components/ReelCard";
import type { ReelItem } from "@/lib/reels/types";

const MAX_CYCLES = 50;

/**
 * 縦スワイプのリール一覧。最後まで見きったら先頭へ戻るのではなく、
 * 同じ並びをもう一周ぶん継ぎ足して下スワイプを続けられるようにする(永遠にループ)。
 */
export function ReelLoopFeed({ reels }: { reels: ReelItem[] }) {
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

  useEffect(() => {
    if (!reels.length) return;
    if (activeIndex >= loopedReels.length - 3) {
      setCycles((c) => Math.min(c + 1, MAX_CYCLES));
    }
  }, [activeIndex, loopedReels.length, reels.length]);

  if (!reels.length) {
    return <p className="px-2 py-10 text-center text-sm text-neutral-500">投稿はまだありません。</p>;
  }

  return (
    <div className="space-y-4">
      {loopedReels.map(({ reel, loopKey }, index) => {
        const media = reel.media[0];
        return (
          // PC(md以上)では動画の縦横比(9:16)を保ったまま画面に収まるサイズに収める
          // (このwrapperが無いと、ReelCardのmd:h-full/w-autoが親の不定な高さのせいで
          // 効かず、幅いっぱいまで広がって縦長になりすぎる)。
          <div key={loopKey} className="mx-auto w-full md:flex md:h-[85dvh] md:items-center md:justify-center">
            <ReelCard
              reelId={reel.id}
              castId={reel.castId}
              commentsEnabled={reel.isCommentsEnabled}
              containerRef={registerItem(index)}
              isActive={index === activeIndex}
              videoUrl={media?.type === "video" ? media.url : undefined}
              posterImageUrl={media?.type === "video" ? media.poster : media?.url}
              accountName={reel.castName}
              accountAvatarUrl={reel.castAvatarUrl ?? undefined}
              profileUrl={reel.castId ? `/cast/${reel.castId}` : `/shops/${reel.shopId}`}
              shopName={reel.shopName}
              createdAt={reel.createdAt}
              ctaUrl={reelCtaUrl(reel)}
              likesCount={likeCounts[reel.id] ?? reel.likesCount}
              liked={liked.has(reel.id)}
              onToggleLike={() => toggleLike(reel.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

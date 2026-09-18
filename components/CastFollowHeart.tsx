"use client";

import { Heart } from "lucide-react";
import { useCastFollows } from "@/lib/reels/useFollows";
import { useLocale } from "@/components/i18n/LocaleProvider";

/** いいね数の横に添える、フォロー状態を示す小さいハート。フォロー中は塗り、未フォローは白抜き。 */
export function CastFollowHeart({ castId, size = 16 }: { castId: string; size?: number }) {
  const { followedCastIds, toggleCastFollow } = useCastFollows();
  const { t } = useLocale();
  const followed = followedCastIds.has(castId);

  return (
    <button
      type="button"
      onClick={() => toggleCastFollow(castId)}
      aria-label={followed ? t.common.unfollow : t.common.follow}
      aria-pressed={followed}
      className="inline-flex items-center justify-center"
    >
      <Heart
        size={size}
        className={followed ? "fill-brand text-brand" : "text-neutral-400"}
        strokeWidth={followed ? 0 : 1.75}
      />
    </button>
  );
}

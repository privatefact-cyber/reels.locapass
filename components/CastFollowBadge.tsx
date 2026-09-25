"use client";

import { Plus } from "lucide-react";
import { useCastFollows } from "@/lib/reels/useFollows";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * プロフィールアイコンの右下に重ねる「+」バッジ(インスタのストーリー追加ボタンと同じ位置)。
 * 未フォローの時だけ表示し、タップでフォローする。フォロー済みなら何も出さない。
 */
export function CastFollowBadge({ castId }: { castId: string }) {
  const { followedCastIds, toggleCastFollow } = useCastFollows();
  const { t } = useLocale();
  const followed = followedCastIds.has(castId);

  if (followed) return null;

  return (
    <button
      type="button"
      onClick={() => toggleCastFollow(castId)}
      aria-label={t.common.follow}
      className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-page bg-accent text-on-accent"
    >
      <Plus size={14} strokeWidth={3} />
    </button>
  );
}

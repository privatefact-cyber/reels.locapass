"use client";

import { useState } from "react";
import { useCastFollows } from "@/lib/reels/useFollows";
import { StoryViewerModal } from "@/components/StoryViewerModal";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * ストーリーを持つキャストの丸型サムネイル(インスタのストーリーリングと同じ見た目)。
 * フォロー中なら即再生、未フォローならフォローを促す案内を出す(本文は絶対に見せない
 * ―― RLS側でも未フォローには行が返らないようになっている、これは二重の入口ガード)。
 */
export function StoryRing({
  castId,
  castName,
  avatarUrl,
  isOwnCast = false,
  size = "md",
  showLabel = true,
}: {
  castId: string;
  castName: string;
  avatarUrl: string | null;
  /** キャスト本人が自分のストーリーを見る場合(フォロー判定をスキップする) */
  isOwnCast?: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  const { followedCastIds, toggleCastFollow } = useCastFollows();
  const { t } = useLocale();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [showGate, setShowGate] = useState(false);

  const canView = isOwnCast || followedCastIds.has(castId);
  const dimension = size === "sm" ? "h-14 w-14" : size === "lg" ? "h-20 w-20" : "h-16 w-16";

  return (
    <>
      <button
        type="button"
        onClick={() => (canView ? setViewerOpen(true) : setShowGate(true))}
        className="flex min-w-[64px] flex-col items-center gap-1"
      >
        <div className="rounded-full bg-gradient-to-tr from-yellow-400 via-rose-500 to-purple-600 p-[2px]">
          <div className="rounded-full bg-black p-[2px]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={castName} className={`${dimension} rounded-full object-cover`} />
            ) : (
              <div
                className={`${dimension} flex items-center justify-center rounded-full bg-neutral-800 text-lg font-semibold text-neutral-500`}
              >
                {castName.slice(0, 1)}
              </div>
            )}
          </div>
        </div>
        {showLabel && (
          <span className="max-w-[64px] truncate text-center text-[11px] text-neutral-300">{castName}</span>
        )}
      </button>

      {viewerOpen && (
        <StoryViewerModal castId={castId} castName={castName} onClose={() => setViewerOpen(false)} />
      )}

      {showGate && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-6"
          onClick={() => setShowGate(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-white/10 bg-neutral-900 p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-white">
              {castName}
              {t.cast.followGateTitle}
              <br />
              {t.cast.followGateSub}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  toggleCastFollow(castId);
                  setShowGate(false);
                }}
                className="rounded-full bg-gold px-6 py-2 text-sm font-semibold text-black hover:bg-gold-light"
              >
                {t.common.follow}
              </button>
              <button
                type="button"
                onClick={() => setShowGate(false)}
                className="text-xs text-neutral-400 hover:text-neutral-300"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect } from "react";
import { recordReelEvent } from "@/lib/reels/trackReelEvent";

/** 1秒以上表示されたら「閲覧」、5秒以上なら「しっかり見られた」として記録する。reelIdが無い(広告など)ときは何もしない。 */
export function useReelViewTracking(reelId: string | undefined, active: boolean): void {
  useEffect(() => {
    if (!reelId || !active) return;
    const viewTimer = window.setTimeout(() => recordReelEvent("view", { reelId }), 1000);
    const engagedTimer = window.setTimeout(() => recordReelEvent("engaged", { reelId }), 5000);
    return () => {
      window.clearTimeout(viewTimer);
      window.clearTimeout(engagedTimer);
    };
  }, [reelId, active]);
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getViewerId } from "@/lib/reels/viewer-id";
import type { ReelItem } from "@/lib/reels/types";

const LIKED_KEY = "modella_liked_reels";

function loadLikedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(LIKED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveLikedSet(set: Set<string>) {
  window.localStorage.setItem(LIKED_KEY, JSON.stringify(Array.from(set)));
}

/** いいねの状態管理(localStorageの楽観更新 + Supabaseへの反映)を各リール一覧画面で使い回す。 */
export function useReelLikes(reels: ReelItem[]) {
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>(
    () => Object.fromEntries(reels.map((r) => [r.id, r.likesCount])),
  );

  useEffect(() => {
    setLiked(loadLikedSet());
  }, []);

  useEffect(() => {
    setLikeCounts((prev) => {
      const next = { ...prev };
      for (const r of reels) {
        if (!(r.id in next)) next[r.id] = r.likesCount;
      }
      return next;
    });
  }, [reels]);

  async function toggleLike(reelId: string) {
    const supabase = createClient();
    const viewerId = getViewerId();
    const isLiked = liked.has(reelId);

    const nextLiked = new Set(liked);
    if (isLiked) {
      nextLiked.delete(reelId);
    } else {
      nextLiked.add(reelId);
    }
    setLiked(nextLiked);
    saveLikedSet(nextLiked);
    setLikeCounts((prev) => ({
      ...prev,
      [reelId]: Math.max((prev[reelId] ?? 0) + (isLiked ? -1 : 1), 0),
    }));

    if (isLiked) {
      await supabase.from("locapass_reel_likes").delete().eq("reel_id", reelId).eq("viewer_id", viewerId);
    } else {
      await supabase.from("locapass_reel_likes").insert({ reel_id: reelId, viewer_id: viewerId });
    }
  }

  return { liked, likeCounts, toggleLike };
}

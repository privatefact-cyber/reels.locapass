"use client";

import { useEffect, useState } from "react";

export type PhotoViewer = { userId: string | null; likedPostIds: Set<string>; followingIds: Set<string> };

const EMPTY = (): PhotoViewer => ({ userId: null, likedPostIds: new Set(), followingIds: new Set() });

// ページ内で1回だけ取得して共有する(いいねボタンが何個あっても/api/photo/meは1回)。
let cache: Promise<PhotoViewer> | null = null;

function load(): Promise<PhotoViewer> {
  if (!cache) {
    cache = fetch("/api/photo/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { userId?: string | null; likedPostIds?: string[]; followingIds?: string[] } | null) => ({
        userId: d?.userId ?? null,
        likedPostIds: new Set(d?.likedPostIds ?? []),
        followingIds: new Set(d?.followingIds ?? []),
      }))
      .catch(() => EMPTY());
  }
  return cache;
}

/** ログイン中の会員の「いいね済み/フォロー中」。取得できるまではnull。 */
export function usePhotoViewer(): PhotoViewer | null {
  const [viewer, setViewer] = useState<PhotoViewer | null>(null);
  useEffect(() => {
    let alive = true;
    void load().then((v) => alive && setViewer(v));
    return () => {
      alive = false;
    };
  }, []);
  return viewer;
}

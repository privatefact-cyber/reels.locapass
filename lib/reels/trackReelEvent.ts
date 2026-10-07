"use client";

import { createClient } from "@/lib/supabase/client";
import { getViewerId } from "@/lib/reels/viewer-id";

/**
 * 投稿者向けインサイト用の閲覧記録。ログイン不要で、ブラウザごとのランダムID(いいねと同じ)で数える。
 *   view       : そのリールが1秒以上画面に表示された
 *   engaged    : 5秒以上表示された(「しっかり見られた」)
 *   tag_search : 動画ストックでタグを選んで探した(店舗/キャスト単位)
 * 同じ閲覧者・同じ対象・同じ日は、DB側で1件にまとめられる(ここでも画面表示中の二重送信は避ける)。
 * 投稿者本人・店舗スタッフの閲覧はDB側で数えない。失敗しても画面には何も影響させない。
 */
export type ReelEventType = "view" | "engaged" | "tag_search";

type Target = { reelId?: string; shopId?: string; castId?: string; tag?: string };

const sent = new Set<string>();

export function recordReelEvent(type: ReelEventType, target: Target): void {
  const viewer = getViewerId();
  if (!viewer) return;
  const key = `${type}:${target.reelId ?? ""}:${target.shopId ?? ""}:${target.castId ?? ""}:${target.tag ?? ""}`;
  if (sent.has(key)) return;
  sent.add(key);
  const args = {
    p_type: type,
    p_reel_id: target.reelId ?? null,
    p_shop_id: target.shopId ?? null,
    p_cast_id: target.castId ?? null,
    p_tag: target.tag ?? null,
    p_viewer: viewer,
  };
  void createClient()
    .rpc("locapass_record_event", args as never)
    .then(
      () => undefined,
      () => undefined,
    );
}

"use client";

import { useEffect } from "react";

/**
 * 街の声: 店舗ページが見られたら、その店の噂ネタが古いときだけ裏で更新してもらう(画面には何も出さない)。
 * 本当に調べ直すか(3日ルール・1日上限・ベータのオン/オフ)はAPI側で判定する。
 * 同じ店を開き直すたびに叩かないよう、ブラウザのセッション中は1店舗1回まで。
 */
export function WhisperRefreshPing({ shopId }: { shopId: string }) {
  useEffect(() => {
    const key = `whisper_ping_${shopId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorageが使えない環境でもそのまま1回送る
    }
    fetch(`/api/shops/${shopId}/sync-whisper`, { method: "POST", keepalive: true }).catch(() => {});
  }, [shopId]);
  return null;
}

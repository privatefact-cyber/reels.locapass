"use client";

import { useEffect } from "react";
import { updateHereLocation } from "@/app/pet/actions";

const KEY = "locapass_pet_here_ping";
const INTERVAL_MS = 30 * 60_000;

/**
 * 「いまいる場所の近くでも受け取る」がオンの人だけ、ロカわんを開いたときに現在地を送る(30分に1回まで)。
 * 位置情報の許可をすでにもらっているときだけ動く(ここで許可のダイアログは出さない)。
 * サーバーは約100m単位にまるめて保存し、48時間で消す。
 */
export function HereLocationPing({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(KEY) ?? 0);
    } catch {
      // 保存できない環境では毎回送る(サーバー側は上書きするだけ)
    }
    if (Date.now() - last < INTERVAL_MS) return;
    const send = () =>
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          updateHereLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => undefined);
          try {
            localStorage.setItem(KEY, String(Date.now()));
          } catch {
            // 何もしない
          }
        },
        () => undefined,
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
      );
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((st) => {
          if (st.state === "granted") send();
        })
        .catch(() => undefined);
    }
  }, [enabled]);
  return null;
}

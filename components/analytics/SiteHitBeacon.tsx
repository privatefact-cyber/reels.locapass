"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// document.referrer はSPA遷移では変わらないので、流入元は最初の1回だけ送る。
let firstHit = true;

// ページ遷移ごとに1回、アクセスを記録する(Cookie・個人情報なし)。
export function SiteHitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    try {
      const payload = JSON.stringify({ p: pathname, r: firstHit ? document.referrer || "" : "" });
      const blob = new Blob([payload], { type: "application/json" });
      if (!navigator.sendBeacon?.("/api/hit", blob)) {
        void fetch("/api/hit", { method: "POST", body: payload, headers: { "content-type": "application/json" }, keepalive: true });
      }
      firstHit = false;
    } catch {}
  }, [pathname]);
  return null;
}

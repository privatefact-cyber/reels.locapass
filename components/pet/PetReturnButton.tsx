"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PET_RETURN_KEY } from "./SpotsExplorer";

/**
 * ロカわんからLOCAPASS本体へ移ったとき(おでかけの店舗ページ・右上の「LOCAPASS ›」)に、画面の下に「ロカわんにもどる」を出す。
 * ロカわんのiPhoneアプリの中(UAに LocaWanApp)では、印が無くても、LOCAPASS本体のどのページでも出す。
 * 店舗ページの中でリールや地図へ移っても出し続け、/pet に戻ったら消す(sessionStorage の印で判断)。
 */
export function PetReturnButton() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (pathname === "/pet" || pathname.startsWith("/pet/")) {
        setTo(null);
        return;
      }
      // ロカわんのiPhoneアプリには「戻る」の操作が無いので、LOCAPASS本体のどのページでも、ロカわんへ戻れるようにする
      const inApp = navigator.userAgent.includes("LocaWanApp");
      setTo(sessionStorage.getItem(PET_RETURN_KEY) ?? (inApp ? "/pet" : null));
    } catch {
      setTo(navigator.userAgent.includes("LocaWanApp") ? "/pet" : null);
    }
  }, [pathname]);

  if (!to) return null;
  return (
    <button
      type="button"
      onClick={() => {
        try {
          sessionStorage.removeItem(PET_RETURN_KEY);
        } catch {
          // 何もしない
        }
        router.push(to);
      }}
      className="fixed bottom-[calc(150px+env(safe-area-inset-bottom))] left-3 z-[60] flex items-center gap-1.5 rounded-full bg-[#FF8E5E] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_4px_0_#EE6A36,0_8px_20px_rgba(0,0,0,0.25)] active:translate-y-[2px] md:bottom-6"
    >
      🐾 ロカわんにもどる
    </button>
  );
}

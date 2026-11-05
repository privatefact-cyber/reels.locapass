"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PET_RETURN_KEY } from "./SpotsExplorer";

/**
 * ワンコ手帳の「おでかけ」からLOCAPASSの店舗ページへ移ったときだけ、画面の下に「ワンコ手帳にもどる」を出す。
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
      setTo(sessionStorage.getItem(PET_RETURN_KEY));
    } catch {
      setTo(null);
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
      🐾 ワンコ手帳にもどる
    </button>
  );
}

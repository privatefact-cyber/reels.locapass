"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

const APP_STORE_URL = "https://apps.apple.com/jp/app/id6835396460?ct=webmodal";
const SEEN_KEY = "locawan_appmodal_seen";

/**
 * Web(ブラウザ)で初めて開いた人にだけ1回出す、すりガラスのダウンロード案内。
 * LOCAPASSの初回モーダルと同じ作り。アプリの中・ホーム画面から開いたとき・Android・紹介ページでは出さない。
 */
export function AppStoreModal() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let timer = 0;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
      const ua = navigator.userAgent;
      const inApp = ua.includes("LocaWanApp") || Boolean((window as unknown as { Capacitor?: unknown }).Capacitor);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (inApp || standalone || /Android/i.test(ua)) return;
      timer = window.setTimeout(() => setOpen(true), 800);
    } catch {
      // 保存領域が使えない環境では出さない(毎回出てしまうのを避ける)
    }
    return () => window.clearTimeout(timer);
  }, []);

  function close() {
    setClosing(true);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // 保存できなくても閉じる
    }
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 250);
  }

  if (!open || pathname.startsWith("/pet/app")) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ロカわんアプリのご案内"
      className={`fixed inset-0 z-[90] flex items-center justify-center bg-black/35 backdrop-blur-sm transition-opacity duration-[250ms] ${closing ? "opacity-0" : "opacity-100"}`}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative flex w-[86vw] max-w-sm transform-gpu flex-col items-center gap-4 overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/70 px-8 py-10 text-center text-[#4A3426] shadow-2xl shadow-black/30 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-[250ms] ease-out ${closing ? "scale-90 opacity-0" : "scale-100 opacity-100"}`}
      >
        <button type="button" aria-label="閉じる" onClick={close} className="absolute right-4 top-4 p-1 text-[#9C8273]">
          <X size={18} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pet/app/icon.png" alt="" width={72} height={72} className="rounded-[18px] shadow-[0_6px_16px_-8px_rgba(160,80,30,0.5)]" />
        <div>
          <p className="text-xl font-extrabold">ロカわん</p>
          <p className="text-xs font-bold text-[#8A6A50]">愛犬の手帳アプリ</p>
        </div>
        <p className="text-[13px] leading-relaxed text-[#5C4535]">
          アプリなら、近くの迷子のお知らせが
          <br />
          すぐ届きます。
        </p>
        {/* App Store公式バッジ(形・色は変えない) */}
        <a href={APP_STORE_URL} onClick={close} aria-label="App Storeからダウンロード" className="mt-1 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pet/app/appstore-ja.svg" alt="App Storeからダウンロード" width={190} height={70} />
        </a>
        <button type="button" onClick={close} className="text-xs font-bold text-[#9C8273] underline underline-offset-4">
          このままWebで見る
        </button>
      </div>
    </div>
  );
}

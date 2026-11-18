"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

const APP_STORE_URL = "https://apps.apple.com/jp/app/id6835396460?ct=webbanner";
const DISMISS_KEY = "locawan_appbanner_dismissed";

/**
 * Web(ブラウザ)で開いた人に、iPhoneアプリのダウンロードをすすめる帯。
 * アプリの中・ホーム画面から開いたとき・Android・紹介ページ自身では出さない。閉じたら7日間は出さない。
 */
export function AppStoreBanner() {
  const pathname = usePathname() ?? "";
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const ua = navigator.userAgent;
      const isIos = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const inApp = ua.includes("LocaWanApp") || Boolean((window as unknown as { Capacitor?: unknown }).Capacitor);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      const recently = Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
      setShow(isIos && !inApp && !standalone && !recently);
    } catch {
      setShow(false);
    }
  }, []);

  if (!show || pathname.startsWith("/pet/app")) return null;
  return (
    <div className="mx-auto flex w-full max-w-md items-center gap-2.5 px-4 py-2">
      <div className="flex w-full items-center gap-3 rounded-2xl bg-white p-2.5 shadow-[0_4px_14px_-8px_rgba(122,80,40,0.5)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pet/app/icon.png" alt="" width={44} height={44} className="rounded-[10px]" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-extrabold text-[#4A3426]">ロカわん</p>
          <p className="truncate text-[11px] text-[#9C8273]">アプリなら迷子の通知もすぐ届きます</p>
        </div>
        <a href={APP_STORE_URL} className="shrink-0 rounded-full bg-[#EE6A36] px-3.5 py-1.5 text-xs font-extrabold text-white">
          入手
        </a>
        <button
          type="button"
          aria-label="閉じる"
          className="shrink-0 p-1 text-[#B39C8C]"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, String(Date.now()));
            } catch {
              // 保存できなくても閉じる
            }
            setShow(false);
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "locawan-install-dismissed";

/**
 * 「ホーム画面に追加」のボタン(PWAのインストール)。
 * - Android(Chrome): ボタンを押すと、その場で「インストールしますか?」が出る。
 * - iPhone(Safari): Appleの決まりで、ボタンでは追加できないため、手順の案内だけを出す。
 * - すでにホーム画面から開いているとき、ロカわんのアプリの中では、何も出さない。
 * variant="card": 紹介ページ用(案内つき)。variant="banner": ホーム用(ボタンが使えるときだけ、閉じられる)。
 */
export function PwaInstallButton({ variant = "card" }: { variant?: "card" | "banner" }) {
  const [ev, setEv] = useState<InstallEvent | null>(null);
  const [platform, setPlatform] = useState<"android" | "ios" | "other" | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || ua.includes("LocaWanApp")) {
      setPlatform("other");
      return;
    }
    setPlatform(/Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/i.test(ua) ? "ios" : "other");
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // 保存できない環境でも、そのまま出す
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEv(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!ev) return;
    await ev.prompt();
    const choice = await ev.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setInstalled(true);
    setEv(null);
  }

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 保存できなくても、この画面では閉じる
    }
  }

  if (platform === null || platform === "other") return null;
  if (installed) {
    return <p className="mt-3 rounded-2xl bg-[#E5F7F0] px-3 py-2 text-center text-xs font-bold text-[#22806A]">✓ ホーム画面に追加しました。アイコンから開けます</p>;
  }

  if (variant === "banner") {
    // ホーム: ボタンが使えるときだけ。閉じたら、出さない
    if (!ev || dismissed) return null;
    return (
      <div className="mt-2 flex items-center gap-2 rounded-2xl border border-[#F1E1CF] bg-white px-3 py-2 shadow-[0_4px_14px_-10px_rgba(122,80,40,0.5)]">
        <span className="text-xl" aria-hidden>
          📲
        </span>
        <p className="flex-1 text-xs font-bold text-[#7A5030]">ホーム画面に追加して、アプリのように使えます</p>
        <button type="button" onClick={install} className="rounded-full bg-[#FF8E5E] px-3 py-1.5 text-xs font-extrabold text-white shadow-[0_2px_0_#EE6A36] active:translate-y-[1px]">
          追加
        </button>
        <button type="button" onClick={dismiss} aria-label="閉じる" className="px-1 text-sm font-bold text-[#B39C8C]">
          ✕
        </button>
      </div>
    );
  }

  // 紹介ページ
  return (
    <div className="mt-4 rounded-2xl bg-[#FFF3E6] px-4 py-3 text-center">
      <p className="text-xs font-extrabold text-[#B26A00]">{platform === "android" ? "Androidの方" : "iPhoneの方(アプリがない場合)"}</p>
      {platform === "android" ? (
        ev ? (
          <button type="button" onClick={install} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#FF8E5E] px-5 py-3 text-sm font-extrabold text-white shadow-[0_3px_0_#EE6A36] active:translate-y-[1px]">
            📲 ホーム画面に追加する
          </button>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-[#7A5030]">
            Chromeの右上「⋮」を押して、<strong>「アプリをインストール」</strong>(または「ホーム画面に追加」)を選んでください。
          </p>
        )
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-[#7A5030]">
          Safariの下の共有ボタン(□↑)を押して、<strong>「ホーム画面に追加」</strong>を選んでください。
        </p>
      )}
    </div>
  );
}

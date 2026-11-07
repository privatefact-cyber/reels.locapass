"use client";

import { useEffect, useState } from "react";
import { Loader2, Share } from "lucide-react";
import { PetCard } from "./ui";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))).buffer;
}

type Status = "checking" | "no-key" | "ios-install" | "unsupported" | "denied" | "off" | "on" | "busy";

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * ロカわんの端末通知(Webプッシュ)。LOCAPASS共通の仕組み(public/sw.js・/api/push/subscribe)をそのまま使う。
 * iPhoneは「ホーム画面に追加」したアプリから開いたときだけWebプッシュが使えるので、その案内を出す。
 */
export function PetPushCard() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    (async () => {
      if (!VAPID) return setStatus("no-key");
      if (isIos() && !isStandalone()) return setStatus("ios-install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setStatus("unsupported");
      if (Notification.permission === "denied") return setStatus("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    })().catch(() => setStatus("unsupported"));
  }, []);

  async function enable() {
    if (!VAPID) return;
    setStatus("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setStatus(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
      if (!res.ok) {
        await sub.unsubscribe();
        return setStatus("off");
      }
      setStatus("on");
    } catch {
      setStatus("off");
    }
  }

  async function disable() {
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      setStatus("on");
    }
  }

  return (
    <PetCard className="space-y-3">
      <h3 className="text-sm font-extrabold text-[#EE6A36]">📲 このスマホに通知を届ける</h3>
      {status === "checking" && <Loader2 size={16} className="animate-spin text-[#B39C8C]" />}
      {status === "no-key" && <p className="rounded-2xl bg-[#F4EEE8] px-3 py-2 text-xs font-bold text-[#9C8273]">端末への通知は準備中です。いまはアプリ内のお知らせ(🔔)でお届けします。</p>}
      {status === "ios-install" && (
        <div className="space-y-2 text-sm text-[#5C4535]">
          <p>iPhoneでは、ロカわんを「ホーム画面に追加」すると通知を受け取れます。</p>
          <ol className="list-decimal space-y-1 rounded-2xl bg-[#FFF8F2] py-2 pl-8 pr-3 text-xs">
            <li>
              Safariの下の <Share size={12} className="inline" /> (共有)を押す
            </li>
            <li>「ホーム画面に追加」を選ぶ</li>
            <li>ホーム画面のロカわんから開いて、この画面で通知をオンにする</li>
          </ol>
        </div>
      )}
      {status === "unsupported" && <p className="text-xs text-[#9C8273]">このブラウザは端末への通知に対応していません。</p>}
      {status === "denied" && <p className="text-xs text-[#9C8273]">通知がブロックされています。スマホの設定で、このサイトの通知を許可してください。</p>}
      {(status === "off" || status === "on" || status === "busy") && (
        <button
          type="button"
          onClick={status === "on" ? disable : enable}
          disabled={status === "busy"}
          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-3 text-sm font-extrabold ${status === "on" ? "bg-[#F4EEE8] text-[#7A6050]" : "bg-[#FF8E5E] text-white shadow-[0_4px_0_#EE6A36]"}`}
        >
          {status === "busy" && <Loader2 size={16} className="animate-spin" />}
          {status === "on" ? "✓ 通知オン(タップでオフ)" : "通知をオンにする"}
        </button>
      )}
      <p className="text-[11px] text-[#B39C8C]">ワクチンの期限・迷子アラート・フォロー申請などが届きます。</p>
    </PetCard>
  );
}

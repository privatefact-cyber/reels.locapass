"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

// VAPID公開鍵(base64url)をpushManager.subscribe()が要求するUint8Array形式に変換する。
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0))).buffer;
}

type Status = "checking" | "unsupported" | "denied" | "off" | "on" | "busy";

export function PushNotificationToggle() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setStatus(existing ? "on" : "off");
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setStatus("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });

      const json = subscription.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });

      if (!res.ok) {
        await subscription.unsubscribe();
        setStatus("off");
        return;
      }

      setStatus("on");
    } catch {
      setStatus("off");
    }
  }

  async function disable() {
    setStatus("busy");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("off");
    } catch {
      setStatus("on");
    }
  }

  if (status === "checking") return null;

  if (status === "unsupported") {
    return (
      <p className="mt-1 text-xs text-tone-500">
        このブラウザはプッシュ通知に対応していません。iPhoneの場合はホーム画面に追加すると利用できます。
      </p>
    );
  }

  if (status === "denied") {
    return (
      <p className="mt-1 text-xs text-tone-500">
        通知がブロックされています。端末の通知設定からLOCAPASSの通知を許可してください。
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={status === "on" ? disable : enable}
      disabled={status === "busy"}
      className={`mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-60 ${
        status === "on"
          ? "border border-main/20 text-tone-300"
          : "bg-accent text-on-accent hover:bg-accent-light"
      }`}
    >
      {status === "on" ? (
        <>
          <BellOff size={14} /> 通知をオフにする
        </>
      ) : (
        <>
          <Bell size={14} /> 通知を受け取る
        </>
      )}
    </button>
  );
}

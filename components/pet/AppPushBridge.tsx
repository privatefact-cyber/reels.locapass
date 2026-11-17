"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { savePetApnsToken } from "@/app/pet/pushActions";
import { APP_PUSH_OFF_KEY, APP_PUSH_TOKEN_KEY, getAppPush, isLocaWanIosApp } from "./appPush";

/**
 * ロカわんのiPhoneアプリの中でだけ働く、通知の受け取り口(ログイン中のみ)。
 *  - 通知をオンにしている端末は、起動のたびにトークンを取り直してサーバーに保存する(トークンは変わることがある)
 *  - 通知を押して開いたとき、通知に入っているページ(url)へ移動する
 */
export function AppPushBridge({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!loggedIn || !isLocaWanIosApp()) return;
    const push = getAppPush();
    if (!push) return;
    const handles: { remove: () => Promise<void> | void }[] = [];
    let cancelled = false;

    (async () => {
      handles.push(
        await push.addListener("registration", async (t) => {
          try {
            localStorage.setItem(APP_PUSH_TOKEN_KEY, t.value);
          } catch {
            // 保存できなくても、サーバーへの登録は行う
          }
          await savePetApnsToken(t.value);
        }),
      );
      handles.push(
        await push.addListener("pushNotificationActionPerformed", (a) => {
          const url = a.notification?.data?.url;
          if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//")) router.push(url);
        }),
      );
      if (cancelled) return;
      let off = false;
      try {
        off = localStorage.getItem(APP_PUSH_OFF_KEY) === "1";
      } catch {
        off = false;
      }
      if (off) return;
      const perm = await push.checkPermissions();
      if (perm.receive === "granted") await push.register();
    })().catch((e) => console.error("[app-push] setup failed", e));

    return () => {
      cancelled = true;
      for (const h of handles) void h.remove();
    };
  }, [loggedIn, router]);

  return null;
}

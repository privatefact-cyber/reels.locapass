"use client";

import { useTransition } from "react";
import { setShopMapVideo } from "@/app/admin/(console)/portals/actions";

export function MapVideoOptionToggle({
  portalId,
  shopId,
  enabled,
}: {
  portalId: number;
  shopId: string;
  enabled: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await setShopMapVideo(portalId, shopId, !enabled);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={
        enabled
          ? "rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          : "rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
      }
    >
      {pending ? "処理中..." : enabled ? "動画オプションを解除する" : "動画オプションを有効にする"}
    </button>
  );
}

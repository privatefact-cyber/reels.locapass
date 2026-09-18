"use client";

import { useTransition } from "react";
import { setLocapassShopStatus } from "@/app/admin/(console)/actions";

export function LocapassShopStatusToggle({
  shopId,
  status,
}: {
  shopId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const isActive = status === "active";

  function handleClick() {
    startTransition(async () => {
      await setLocapassShopStatus(shopId, isActive ? "inactive" : "active");
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={
        isActive
          ? "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          : "rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
      }
    >
      {pending ? "処理中..." : isActive ? "非公開にする" : "公開する"}
    </button>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { endBoost } from "@/app/dashboard/shop/[shopId]/boost/actions";

export function BoostEndButton({ shopId, boostId }: { shopId: string; boostId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("このブーストを今すぐ終了しますか?")) return;
        start(async () => {
          await endBoost(shopId, boostId);
          router.refresh();
        });
      }}
      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-700 disabled:opacity-50"
    >
      {pending ? "終了中..." : "今すぐ終了"}
    </button>
  );
}

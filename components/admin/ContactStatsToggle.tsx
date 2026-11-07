"use client";

import { useState, useTransition } from "react";
import { setContactStatsVisible } from "@/app/admin/(console)/portals/actions";

/** 店舗ダッシュボードの「経由の連絡」カードを、店舗に見せるかどうかの運営専用トグル。 */
export function ContactStatsToggle({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await setContactStatsVisible(!enabled);
      } catch (e) {
        setError(e instanceof Error ? e.message : "切り替えに失敗しました");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={pending}
        className={
          enabled
            ? "rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            : "rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
        }
      >
        {pending ? "処理中..." : enabled ? "店舗には非表示にする" : "店舗に表示する"}
      </button>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

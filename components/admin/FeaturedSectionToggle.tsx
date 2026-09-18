"use client";

import { useTransition } from "react";
import { setFeaturedSectionEnabled } from "@/app/admin/(console)/actions";

/** トップページのFEATURED枠(提携店舗特集)を表示するかどうかの、運営専用トグル。 */
export function FeaturedSectionToggle({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await setFeaturedSectionEnabled(!enabled);
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
      {pending ? "処理中..." : enabled ? "非表示にする" : "表示する"}
    </button>
  );
}

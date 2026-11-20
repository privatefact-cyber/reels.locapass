"use client";

import { useState, useTransition } from "react";
import { setAdSlotLive } from "@/app/admin/(console)/portals/actions";

/** 店舗ページの広告枠(自社告知・編集枠)を、無料掲載の店舗ページに出すかどうかのスイッチ。スーパー管理者専用。 */
export function AdSlotSwitch({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    startTransition(async () => {
      try {
        await setAdSlotLive(next);
      } catch (e) {
        setOn(!next);
        setError(e instanceof Error ? e.message : "切り替えに失敗しました");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="広告枠を表示する"
        onClick={toggle}
        disabled={pending}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${on ? "bg-indigo-600" : "bg-slate-300"}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
      </button>
      <span className="text-[11px] font-semibold text-slate-600">{pending ? "保存中…" : on ? "表示中" : "非表示"}</span>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

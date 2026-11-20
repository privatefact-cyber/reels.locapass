"use client";

import { useState, useTransition } from "react";
import { setAutoLinkPaidOnly } from "@/app/admin/(console)/portals/actions";

/** 収集したYouTube動画の自動の紐づけ・公開を、有料の店舗だけに限るかどうかのスイッチ。スーパー管理者専用。 */
export function AutoLinkPaidOnlySwitch({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    startTransition(async () => {
      try {
        await setAutoLinkPaidOnly(next);
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
        aria-label="自動の紐づけを有料店だけにする"
        onClick={toggle}
        disabled={pending}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${on ? "bg-indigo-600" : "bg-slate-300"}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
      </button>
      <span className="text-[11px] font-semibold text-slate-600">{pending ? "保存中…" : on ? "有料店だけ" : "全店に紐づける"}</span>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

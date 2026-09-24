"use client";

import { useTransition } from "react";
import { setMachiNoKoeBetaEnabled } from "@/app/admin/(console)/portals/actions";

/** コンシェルジュの「街の声 β」タブ(locapass用)を出すかどうかの、スーパー管理者専用トグル。 */
export function MachiNoKoeBetaToggle({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await setMachiNoKoeBetaEnabled(!enabled);
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

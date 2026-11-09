"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/**
 * 「下書きを作る」ボタン。AIが書き終わるまで(数十秒かかる)、「考え中…○秒」と経過時間を出して、二重に押せないようにする。
 * action は、サーバー側の処理(createDraftNow)。終わると、画面が自動で切り替わる。
 */
export function CreateDraftButton({ action, label, primary = false }: { action: () => Promise<{ ok: boolean; message: string }>; label: string; primary?: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!pending) return;
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          setNotice(null);
          try { setNotice(await action()); } catch { setNotice({ ok: false, message: "通信に失敗しました。ページを開き直して確認してください" }); }
          router.refresh();
        })}
        className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60 ${primary ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-800"}`}
      >
        {pending ? "考え中…" : label}
      </button>
      {pending ? (
        <span role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-semibold text-amber-700">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
          AIが書いています…{seconds}秒(最大1分ほど。このまま待ってください)
        </span>
      ) : notice ? (
        <span role="status" className={`text-sm font-semibold ${notice.ok ? "text-emerald-700" : "text-red-700"}`}>{notice.message}</span>
      ) : (
        <span className="text-xs text-slate-500">AIが書くので、数十秒かかります</span>
      )}
    </div>
  );
}

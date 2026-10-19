"use client";

import { useEffect, useState, useTransition } from "react";

type Status = "idle" | "saved" | "error";

/**
 * 管理画面の保存フォーム。「更新する」を押すと更新中の表示になり、終わると
 * 「更新しました」(失敗時は「更新に失敗しました」)を目立つ形で出す。
 * actionはサーバーアクション(FormDataを受けるもの)をそのまま渡す。
 */
export function SaveForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // 完了表示は数秒で消す(連続で押したときも毎回出るよう、statusを都度更新する)。
  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 6000);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <form
      className={className}
      action={(formData) => {
        setStatus("idle");
        startTransition(async () => {
          try {
            await action(formData);
            setError(null);
            setStatus("saved");
          } catch (e) {
            // 本番ではサーバー側の詳細メッセージは伏せられるので、短い案内にする。
            setError(e instanceof Error && !/Server Components render/.test(e.message) ? e.message : null);
            setStatus("error");
          }
        });
      }}
    >
      {children}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "更新中…" : "更新する"}
        </button>
        <div role="status" aria-live="polite" className="mt-2 min-h-[1.5rem]">
          {status === "saved" && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              ✓ 更新しました
            </p>
          )}
          {status === "error" && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              更新に失敗しました。{error ? `(${error})` : "もう一度お試しください。"}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}

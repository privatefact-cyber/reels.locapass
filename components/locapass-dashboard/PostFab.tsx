"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/** 「投稿!」ボタンの中から選べる投稿の種類。名前や行き先は、ここだけを直せば変えられる。 */
export const POST_KINDS = [
  { key: "normal", label: "通常", icon: "📝", description: "写真や動画を、ずっと残る投稿として出す", path: "/me?kind=normal" },
  { key: "event", label: "イベント", icon: "🎉", description: "イベントやお知らせを載せる", path: "/posts?tab=event" },
  { key: "reel", label: "リール", icon: "🎬", description: "縦型の動画を出す", path: "/me?kind=reel" },
  { key: "tweet", label: "VOICE", icon: "💬", description: "文字だけの短い投稿(写真も1枚つけられます)", path: "/murmurs" },
] as const;

/** 管理画面の右下に出る、1つだけの「投稿!」ボタン。押すと、投稿の種類を選ぶ画面が下から出る。 */
export function PostFab({ basePath }: { basePath: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 rounded-full bg-slate-900 px-6 py-4 text-base font-bold text-white shadow-lg active:scale-95 sm:right-6"
      >
        ✏️ 投稿!
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="投稿の種類を選ぶ">
          <button type="button" aria-label="閉じる" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold text-slate-900">どれを投稿しますか?</p>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1 text-sm text-slate-500 hover:bg-slate-100">閉じる</button>
            </div>
            <ul className="space-y-2">
              {POST_KINDS.map((k) => (
                <li key={k.key}>
                  <Link
                    href={`${basePath}${k.path}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 active:bg-slate-100"
                  >
                    <span className="text-2xl" aria-hidden>{k.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-base font-bold text-slate-900">{k.label}</span>
                      <span className="block text-xs text-slate-500">{k.description}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

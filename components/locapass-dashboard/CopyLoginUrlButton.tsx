"use client";

import { useState } from "react";

export function CopyLoginUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        } catch {
          // コピーできない端末では、表示されているURLを長押しでコピーしてもらう。
        }
      }}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      {copied ? "コピーしました" : "URLをコピー"}
    </button>
  );
}

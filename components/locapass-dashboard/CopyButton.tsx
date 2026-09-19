"use client";

import { useState } from "react";

export function CopyButton({ value, label = "コピー" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードAPIが使えない環境では何もしない(選択コピーにフォールバック)。
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="shrink-0 rounded border border-black/20 bg-white px-3 py-2 text-xs font-semibold text-black/70 hover:bg-black/5"
    >
      {copied ? "コピーしました" : label}
    </button>
  );
}

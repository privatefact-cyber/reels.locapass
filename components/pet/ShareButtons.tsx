"use client";

import { useState } from "react";
import { Copy, Share2 } from "lucide-react";

/** LINE・X・端末の共有・URLコピー。迷子・保護の情報を広げるため。 */
export function ShareButtons({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent;
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const btn = "flex flex-col items-center gap-1 rounded-2xl bg-white px-2 py-2.5 text-[11px] font-bold text-[#7A6050] shadow-[0_4px_14px_-10px_rgba(122,80,40,0.5)] active:scale-95";
  return (
    <div className="grid grid-cols-4 gap-2">
      <a href={`https://social-plugins.line.me/lineit/share?url=${enc(url)}&text=${enc(text)}`} target="_blank" rel="noreferrer" className={btn}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#06C755] text-sm font-extrabold text-white">L</span>
        LINE
      </a>
      <a href={`https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`} target="_blank" rel="noreferrer" className={btn}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-sm font-extrabold text-white">𝕏</span>X
      </a>
      <button
        type="button"
        className={btn}
        onClick={async () => {
          if (canNative) await navigator.share({ title: text, text, url }).catch(() => undefined);
          else {
            await navigator.clipboard.writeText(`${text}\n${url}`).catch(() => undefined);
            setCopied(true);
          }
        }}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFEBDD] text-[#EE6A36]">
          <Share2 size={16} />
        </span>
        {canNative ? "ほかのアプリ" : copied ? "コピー済" : "共有"}
      </button>
      <button
        type="button"
        className={btn}
        onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F4EEE8] text-[#9C8273]">
          <Copy size={16} />
        </span>
        {copied ? "コピー済" : "URL"}
      </button>
    </div>
  );
}

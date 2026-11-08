"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * 記事のシェアボタン。リール(ReelCard)と同じ動き: 対応する端末ではOSの共有画面(Web Share API)を開き、
 * 使えない環境(PCなど)ではリンクをコピーして「リンクをコピーしました」と出す。
 * url は、その記事の、今の言語のURL(正規ドメイン)を渡す。
 */
export function ShareButton({ url, title, className = "" }: { url: string; title: string; className?: string }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleShare() {
    const data = { title, url };
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch {
        // ユーザーがシェアをキャンセルした場合等は何もしない。
      }
      return;
    }
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        // クリップボード権限が無い環境等では何もしない。
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={t.common.share}
      className={`relative inline-flex items-center gap-1.5 rounded-full border border-main/20 px-3 py-1.5 text-xs text-main transition hover:border-hl-400/60 hover:text-hl-200 ${className}`}
    >
      <Share2 size={16} />
      <span>{t.common.share}</span>
      {copied && (
        <span
          role="status"
          className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-xs text-main shadow-lg"
        >
          {t.common.linkCopied}
        </span>
      )}
    </button>
  );
}

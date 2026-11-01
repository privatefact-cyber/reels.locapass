"use client";

import { useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { showOriginalLabel, showTranslationLabel } from "@/lib/i18n/originalLabel";

/**
 * 翻訳して表示している文章(キャストの自己紹介・スタッフの紹介文)。原文があれば「🌐 原文を見る」で切り替えられる
 * (切替は画面の中だけ。費用はかからない)。original を渡さないときは、普通の文章になる。
 */
export function TranslatedText({
  text,
  original,
  className,
}: {
  text: string;
  original?: { text: string; lang: string } | null;
  className?: string;
}) {
  const { locale } = useLocale();
  const [showOriginal, setShowOriginal] = useState(false);
  const orig = original?.text.trim() ? original : null;
  return (
    <div>
      <p className={className}>{showOriginal && orig ? orig.text : text}</p>
      {orig && (
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className="mt-2 rounded-full border border-main/25 bg-black/30 px-2.5 py-0.5 text-[11px] font-semibold text-main/90"
        >
          🌐 {showOriginal ? showTranslationLabel(locale) : showOriginalLabel(locale, orig.lang)}
        </button>
      )}
    </div>
  );
}

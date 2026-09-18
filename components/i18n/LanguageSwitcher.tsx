"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { LOCALES, LOCALE_SHORT_LABEL } from "@/lib/i18n/locale";

/**
 * ドロップダウンだと選択を見落とされやすかった(タップしたつもりが開いただけ、等)ため、
 * 常時見えている3つのボタン(日/EN/中)を直接タップする方式にした。誤操作の余地がない。
 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-white/15 bg-white/5 p-0.5 text-[11px] font-semibold">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={l === locale}
          className={`rounded-full px-2 py-1 transition ${
            l === locale ? "bg-gold text-black" : "text-white/70 hover:text-white"
          }`}
        >
          {LOCALE_SHORT_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useLocale, usePublicPathname } from "@/components/i18n/LocaleProvider";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localeDir, type Locale } from "@/lib/i18n/locale";
import { isLocalizablePath, localizeHref } from "@/lib/i18n/localePath";

const VERSION_LABEL: Record<Exclude<Locale, "ja">, string> = {
  en: "English version",
  zh: "中文版",
  ar: "النسخة العربية",
};

/**
 * 接頭辞なし(日本語)の公開ページに、前に別の言語を選んだ人(Cookie)が来たときだけ出す小さな案内。
 * 自動転送はしない(検索結果から日本語URLに来た人・クローラーの扱いをURLだけで決めるため)。
 */
export function LocaleSuggestion() {
  const { locale } = useLocale();
  const pathname = usePublicPathname();
  const [preferred, setPreferred] = useState<Exclude<Locale, "ja"> | null>(null);

  useEffect(() => {
    const value = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))?.[1];
    setPreferred(isLocale(value) && value !== "ja" ? value : null);
  }, []);

  if (!preferred || locale !== DEFAULT_LOCALE || !isLocalizablePath(pathname)) return null;

  return (
    <div className="relative border-b border-main/5 px-4 py-1 text-center text-[11px]">
      <a
        href={localizeHref(pathname, preferred) + (typeof window !== "undefined" ? window.location.search : "")}
        lang={preferred}
        dir={localeDir(preferred)}
        className="text-accent underline underline-offset-2"
      >
        {VERSION_LABEL[preferred]} →
      </a>
    </div>
  );
}

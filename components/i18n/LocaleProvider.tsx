"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { dictionaries, type Dictionary } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "@/lib/i18n/locale";
import { isLocalizablePath, localizeHref, stripLocalePrefix } from "@/lib/i18n/localePath";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Dictionary;
  /** サイト内リンクを今の言語のURLにする(例 "/mito" → "/en/mito")。 */
  localize: (href: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * 公開ページは言語別URL(日本語は接頭辞なし、/en /zh /ar)で言語が決まる(lib/i18n/localePath.ts)。
 * サーバー側は layout.tsx が getServerLocale() で読んだ初期値を渡すので、初回表示から言語が合っている。
 * 切り替え時はCookie(luxela_locale)を更新し、公開ページなら同じページの言語別URLへ移動する
 * (<html lang>・ルートlayoutごと描き直すため、ページ遷移でなく読み込み直し)。
 * 管理画面・マイページ等の対象外パスは従来どおりURLを変えず、Cookie更新後に router.refresh() する。
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const router = useRouter();

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      const path = stripLocalePrefix(window.location.pathname);
      if (isLocalizablePath(path)) {
        window.location.assign(localizeHref(path, next) + window.location.search + window.location.hash);
        return;
      }
      setLocaleState(next);
      router.refresh();
    },
    [router],
  );

  const localize = useCallback((href: string) => localizeHref(href, locale), [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: dictionaries[locale], localize }),
    [locale, setLocale, localize],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

/** サイト内リンクを今の言語のURLにする関数。LocaleProviderの外では日本語(接頭辞なし)のまま返す。 */
export function useLocalize(): (href: string) => string {
  const ctx = useContext(LocaleContext);
  return ctx?.localize ?? ((href: string) => localizeHref(href, DEFAULT_LOCALE));
}

/** useRouter() の代わり。push/replace/prefetch のサイト内パスに今の言語の接頭辞を付ける。 */
export function useLocaleRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();
  const localize = useLocalize();
  return useMemo(
    () => ({
      ...router,
      push: (href, options) => router.push(localize(href), options),
      replace: (href, options) => router.replace(localize(href), options),
      prefetch: (href, options) => router.prefetch(localize(href), options),
    }),
    [router, localize],
  );
}

/** 言語の接頭辞を外した現在のパス(/en/map → /map)。パスで分岐する判定はこれを使う。 */
export function usePublicPathname(): string {
  return stripLocalePrefix(usePathname() ?? "/");
}

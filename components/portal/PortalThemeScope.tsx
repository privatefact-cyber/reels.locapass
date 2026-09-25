"use client";

import { useEffect } from "react";
import { setPageTheme } from "@/lib/pageTheme";
import type { SiteTheme } from "@/lib/theme";

/**
 * 子ポータルで選んだ配色テーマを、このページ表示中だけ適用する(null ならサイト全体の設定に従う)。
 * ページを離れると自動でサイト全体の配色に戻る。描画直後に一瞬サイト全体の配色が見えないよう、
 * 同じ値をインラインスクリプトでも先に当てる。
 */
export function PortalThemeScope({ theme }: { theme: SiteTheme | null }) {
  useEffect(() => {
    setPageTheme(theme);
    return () => setPageTheme(null);
  }, [theme]);

  if (!theme) return null;
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.setAttribute("data-theme",${JSON.stringify(theme)})`,
      }}
    />
  );
}

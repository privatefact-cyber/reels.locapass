"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { resolveSiteTheme, type SiteTheme } from "@/lib/theme";
import { usePageTheme } from "@/lib/pageTheme";

/**
 * 画面遷移(公開ページ ⇄ 管理画面)や管理画面でのテーマ変更のたびに <html data-theme> を付け直す。何も描画しない。
 * 子ポータルのページで個別のテーマが選ばれていれば(PortalThemeScope)、そちらを優先する。
 */
export function ThemeSync({ manual }: { manual: SiteTheme | null }) {
  const pathname = usePathname();
  const pageTheme = usePageTheme();
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", pageTheme ?? resolveSiteTheme(pathname ?? "/", manual));
  }, [pathname, manual, pageTheme]);
  return null;
}

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { resolveSiteTheme, type SiteTheme } from "@/lib/theme";

/** 画面遷移(公開ページ ⇄ 管理画面)や管理画面でのテーマ変更のたびに <html data-theme> を付け直す。何も描画しない。 */
export function ThemeSync({ manual }: { manual: SiteTheme | null }) {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolveSiteTheme(pathname ?? "/", manual));
  }, [pathname, manual]);
  return null;
}

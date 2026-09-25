"use client";

import { useSyncExternalStore } from "react";
import type { SiteTheme } from "@/lib/theme";

/**
 * ページ単位の配色テーマ(子ポータルのトップ・所属店舗ページで使う)。
 * PortalThemeScope がセットし、ThemeSync がサイト全体の設定より優先して <html data-theme> に反映する。
 */
let current: SiteTheme | null = null;
const listeners = new Set<() => void>();

export function setPageTheme(theme: SiteTheme | null) {
  current = theme;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePageTheme(): SiteTheme | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

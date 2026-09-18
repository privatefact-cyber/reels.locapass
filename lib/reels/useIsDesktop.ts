"use client";

import { useEffect, useState } from "react";

/**
 * TailwindのmdブレークポイントSame(768px)以上かどうかをJS側でも判定する。
 * モバイル/デスクトップでレンダリングするコンポーネント自体を出し分けたい場合に使う
 * (CSSのdisplay切り替えだけだと、非表示側のimg/videoも通信が発生してしまうため)。
 */
const QUERY = "(min-width: 768px)";

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    setIsDesktop(mql.matches);

    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}

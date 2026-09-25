"use client";

import { useRouter, usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { OPEN_FEED_GATE_EVENT } from "@/lib/reels/events";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * ボトムナビ右端のハンバーガーメニュー。
 * トップページではCAST/SHOP選択モーダルをその場で再度開き、他ページからは
 * トップへ遷移した上で開く(?menu=1をReelFeed側で拾う)。
 */
export function MenuButton() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLocale();

  function handleClick() {
    if (pathname === "/") {
      window.dispatchEvent(new Event(OPEN_FEED_GATE_EVENT));
    } else {
      router.push("/?menu=1");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={t.nav.menu}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/60 bg-tone-800 text-accent"
    >
      <Menu size={16} />
    </button>
  );
}

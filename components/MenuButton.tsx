"use client";

import { Menu } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * ボトムナビ右端(PCではヘッダー右端)のメニューボタン(☰)。押すと、下からメニューのシート(MenuSheet)が出る。
 * シートの開閉の状態は SiteChrome が持つ。
 */
export function MenuButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useLocale();

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t.nav.menu}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/60 bg-tone-800 text-accent"
    >
      <Menu size={16} />
    </button>
  );
}

"use client";

import { useRouter, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { OPEN_SEARCH_EVENT } from "@/lib/reels/events";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * ボトムナビの検索ボタン。フィード上部の検索アイコンと同じ検索モーダルを開く。
 * トップページではその場でイベントを飛ばして開き、他ページからはトップへ遷移した上で開く
 * (?search=1をReelFeed側で拾う、MenuButtonと同じ思想)。
 */
export function SearchButton() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLocale();

  function handleClick() {
    if (pathname === "/") {
      window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
    } else {
      router.push("/?search=1");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex flex-col items-center gap-0.5 p-2 text-neutral-400 hover:text-white"
      aria-label={t.nav.search}
    >
      <Search size={22} />
      <span className="text-[10px] leading-none">{t.nav.search}</span>
    </button>
  );
}

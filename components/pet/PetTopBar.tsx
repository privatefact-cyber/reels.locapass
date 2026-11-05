"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronLeft } from "lucide-react";

/** 上のバー。トップでは「ワンコ手帳」のロゴ、下の階層では戻るボタン。お知らせはLOCAPASSのお知らせ一覧へ。 */
export function PetTopBar() {
  const pathname = usePathname() ?? "/pet";
  const isRoot = ["/pet", "/pet/spots", "/pet/lost", "/pet/follows", "/pet/settings"].includes(pathname);
  const isCard = pathname.startsWith("/pet/t/");
  return (
    <header className="sticky top-0 z-30 bg-[#FFF7EC]/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        {isRoot || isCard ? (
          <Link href={isCard ? "/" : "/pet"} className="flex items-center gap-1.5 text-lg font-extrabold tracking-wide text-[#4A3426]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF8E5E] text-base shadow-[0_3px_0_#EE6A36]" aria-hidden>
              🐾
            </span>
            ワンコ手帳
          </Link>
        ) : (
          <button type="button" onClick={() => history.length > 1 ? history.back() : (location.href = "/pet")} className="-ml-2 flex items-center gap-0.5 rounded-full px-2 py-1.5 text-sm font-bold text-[#7A6050] active:scale-95">
            <ChevronLeft size={22} />
            もどる
          </button>
        )}
        <div className="flex items-center gap-1">
          <Link href="/" className="rounded-full px-3 py-1.5 text-xs font-bold text-[#9C8273] active:scale-95">
            LOCAPASS
          </Link>
          {!isCard && (
            <Link href="/notifications" aria-label="お知らせ" className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#7A6050] shadow-sm active:scale-95">
              <Bell size={18} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

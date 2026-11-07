"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronLeft } from "lucide-react";

/** 上のバー。トップでは「ロカわん」のロゴ、下の階層では戻るボタン。お知らせはLOCAPASSのお知らせ一覧へ。 */
export function PetTopBar() {
  const pathname = usePathname() ?? "/pet";
  const isRoot = ["/pet", "/pet/spots", "/pet/lost", "/pet/follows", "/pet/settings"].includes(pathname);
  const isCard = pathname.startsWith("/pet/t/");
  return (
    <header className="sticky top-0 z-30 bg-[#FFF7EC]/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        {isRoot || isCard ? (
          <Link href={isCard ? "/" : "/pet"} className="flex items-center gap-1.5 text-[#4A3426]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF8E5E] text-base shadow-[0_3px_0_#EE6A36]" aria-hidden>
              🐾
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-lg font-extrabold tracking-wide">ロカわん</span>
              <span className="mt-0.5 text-[9px] font-bold tracking-[0.12em] text-[#B39C8C]">by LOCAPASS</span>
            </span>
          </Link>
        ) : (
          <button type="button" onClick={() => history.length > 1 ? history.back() : (location.href = "/pet")} className="-ml-2 flex items-center gap-0.5 rounded-full px-2 py-1.5 text-sm font-bold text-[#7A6050] active:scale-95">
            <ChevronLeft size={22} />
            もどる
          </button>
        )}
        <div className="flex items-center gap-1">
          {/* ロカわんはLOCAPASSのサービス。LOCAPASS本体(地図・お店・リール)へいつでも行けるように */}
          <Link href="/" className="rounded-full border border-[#F1E1CF] bg-white/80 px-3 py-1.5 text-[11px] font-extrabold tracking-wide text-[#7A6050] active:scale-95">
            LOCAPASS ›
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

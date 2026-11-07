"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dog, MapPin, Search, Settings, Trophy } from "lucide-react";

const TABS = [
  { href: "/pet", label: "うちの子", icon: Dog, match: (p: string) => p === "/pet" || (/^\/pet\/[0-9a-f-]{36}/.test(p) && !p.endsWith("/lost")) || p === "/pet/new" },
  { href: "/pet/spots", label: "おでかけ", icon: MapPin, match: (p: string) => p.startsWith("/pet/spots") || p.startsWith("/pet/place") },
  { href: "/pet/gallery", label: "自慢", icon: Trophy, match: (p: string) => p.startsWith("/pet/gallery") || p.startsWith("/pet/follows") || p.startsWith("/pet/post") },
  { href: "/pet/lost", label: "迷子さがし", icon: Search, match: (p: string) => p.startsWith("/pet/lost") || p.startsWith("/pet/found") || p.endsWith("/lost") },
  { href: "/pet/settings", label: "設定", icon: Settings, match: (p: string) => p.startsWith("/pet/settings") },
];

export function PetTabBar() {
  const pathname = usePathname() ?? "/pet";
  if (pathname.startsWith("/pet/t/")) return null; // 名刺ページ(拾った人・名刺交換の相手が見る)にはタブを出さない
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#F1E1CF] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link href={href} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold">
                <span className={`flex h-9 w-11 items-center justify-center rounded-full transition ${active ? "bg-[#FFE3CF] text-[#EE6A36]" : "text-[#B9A292]"}`}>
                  <Icon size={22} strokeWidth={active ? 2.6 : 2} />
                </span>
                <span className={active ? "text-[#EE6A36]" : "text-[#B9A292]"}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

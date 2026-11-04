"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type ShopNavItem = {
  href: string;
  label: string;
  icon: string;
  /** 項目の下に出す一行の説明。 */
  description?: string;
  /** 掲載ページなど、別タブで開くリンク。 */
  external?: boolean;
};
export type ShopNavGroup = { title: string; items: ShopNavItem[] };

/**
 * 店舗管理画面のメニュー。横に並べると長くなって横スクロールになり、スマホでは押し間違えやすいので、
 * 「メニュー」ボタン1つにまとめ、押すとモーダルで全項目をグループごとに大きなボタンで出す。
 * LUXELA本家(components/dashboard/ShopNavMenu.tsx)と同じ作り。
 */
export function ShopNavMenu({ groups, basePath }: { groups: ShopNavGroup[]; /** 「店舗情報」のURL(この下のページでは、ほかの項目を優先して今のページを判定する)。 */ basePath: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (item: ShopNavItem) =>
    !item.external && (item.href === basePath ? pathname === basePath : pathname === item.href || pathname.startsWith(`${item.href}/`));
  const current = groups.flatMap((g) => g.items).find(isActive);

  // ページを移ったら閉じる。
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 開いている間は、背景のページをスクロールさせない。Escで閉じる。
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className="shrink-0">メニュー</span>
        {current && (
          <span className="truncate border-l border-slate-200 pl-2 font-semibold text-slate-500">
            {current.icon} {current.label}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-slate-900/50 sm:items-center sm:p-6" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="メニュー"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full flex-col bg-slate-50 sm:max-h-[85dvh] sm:max-w-3xl sm:overflow-hidden sm:rounded-2xl sm:shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-3">
              <p className="text-base font-bold text-slate-900">メニュー</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="メニューを閉じる"
                className="flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
              {groups
                .filter((g) => g.items.length)
                .map((group) => (
                  <section key={group.title}>
                    <h2 className="mb-2 text-xs font-bold tracking-wide text-slate-500">{group.title}</h2>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.items.map((item) => {
                        const active = isActive(item);
                        const className = `flex min-h-[3.5rem] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-100"
                        }`;
                        const body = (
                          <>
                            <span aria-hidden="true" className="w-7 shrink-0 text-center text-xl">
                              {item.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold">
                                {item.label}
                                {item.external && " ↗"}
                              </span>
                              {item.description && (
                                <span className={`mt-0.5 block text-xs leading-snug ${active ? "text-slate-300" : "text-slate-500"}`}>{item.description}</span>
                              )}
                            </span>
                          </>
                        );
                        return item.external ? (
                          <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={className}>
                            {body}
                          </a>
                        ) : (
                          <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={className}>
                            {body}
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

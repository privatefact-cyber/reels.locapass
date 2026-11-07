"use client";

import { usePathname } from "next/navigation";
import { AdminLanguageSelect } from "@/components/locapass-dashboard/AdminLanguageSelect";

/**
 * 管理画面の表示言語の選択(右上)。店舗管理画面(/dashboard/shop/<店舗ID>/…)では、上のメニューバーの中に置くのでここには出さない。
 * それ以外の画面では、PWA(ホーム画面に追加)でステータスバー(時計・電波)の下に潜り込まないよう、セーフエリア分だけ下げる。
 */
export function DashboardLanguageRow({ current }: { current: string }) {
  const pathname = usePathname();
  if (/^\/dashboard\/shop\/[^/]+/.test(pathname ?? "")) return null;
  return (
    <div className="mx-auto flex max-w-6xl justify-end px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <AdminLanguageSelect current={current} />
    </div>
  );
}

"use client";

import { usePathname } from "next/navigation";

// マップページ(/tokyo/[city]/map)はUber風の没入型フルスクリーンUIのため、
// ヘッダー・ボトムナビ用に確保されている余白(main の max-w、body の pb-20)を
// 一切受けずビューポート全体を使う。fixed insetにすることでbodyのpadding-bottomの
// 影響も受けなくなる(SiteChromeもこのパスではヘッダーを出さない、components/SiteChrome.tsx参照)。
const FULL_BLEED_PATTERN = /^\/map$|^\/[^/]+\/[^/]+\/map$/;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullBleed = FULL_BLEED_PATTERN.test(pathname ?? "");

  if (isFullBleed) {
    return <div className="fixed inset-0 z-0">{children}</div>;
  }

  // max-w-mdは実機の一般的なスマホ幅(〜430px程度)より十分広いので通常は効かないが、
  // iPad miniの縦向き(744px)のようにmd(768px)未満・448pxより広い端末では
  // ページ全体がこの448pxに押し込まれて中央寄せされ、左右が無駄な余白になってしまう。
  // sm(640px)以上ではこの上限を外し、md(768px)からのワイド表示にそのまま繋げる。
  return <main className="mx-auto max-w-md sm:max-w-none md:max-w-[1400px]">{children}</main>;
}

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PET_RETURN_KEY } from "./SpotsExplorer";

/** LOCAPASSのページ(店舗・snap)へ移るリンク。移った先に「ロカわんにもどる」を出し、押すと backTo へ戻る */
export function ReturnLink({ href, backTo, className, children }: { href: string; backTo: string; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        try {
          sessionStorage.setItem(PET_RETURN_KEY, backTo);
        } catch {
          // 保存できない環境では戻るボタンが出ないだけ
        }
      }}
    >
      {children}
    </Link>
  );
}

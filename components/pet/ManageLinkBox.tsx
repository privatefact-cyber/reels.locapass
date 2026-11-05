"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy } from "lucide-react";

/**
 * ログインなしで通報した人への案内。管理用リンク(このURL)を保存しておけば、あとで「解決」「削除」ができる。
 * 会員登録すると、飼い主さんからの「うちの子かも!」が通知で届くことも伝える。
 */
export function ManageLinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-4 space-y-2 rounded-[24px] border-2 border-dashed border-[#FFD38A] bg-[#FFF8E1] p-4 text-sm text-[#8A6A00]">
      <p className="font-extrabold">🔑 このページのURLを保存してください</p>
      <p className="text-xs">ログインせずに通報したため、このURLを持っている人だけが「解決」「削除」できます。ブックマークするか、コピーして自分宛てに送っておいてください。</p>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => undefined);
          setCopied(true);
        }}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-xs font-extrabold text-[#8A6A00]"
      >
        <Copy size={14} />
        {copied ? "コピーしました" : "管理用URLをコピー"}
      </button>
      <p className="text-xs">
        <Link href={`/mypage/login?redirect=${encodeURIComponent("/pet")}`} className="font-extrabold underline">
          LINEなどで無料登録
        </Link>
        すると、次からは飼い主さんからの「うちの子かも!」が通知で届きます。
      </p>
    </div>
  );
}

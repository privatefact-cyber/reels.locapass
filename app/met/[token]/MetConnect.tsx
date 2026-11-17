"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { connectViaMeetQr } from "../actions";

/** 「つながる」ボタン。押すと、FACESをフォローして、FACES側も自動でフォローを返す(DMが開く)。 */
export function MetConnect({ token, castName, autoStart = false }: { token: string; castName: string; autoStart?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: true; castHref: string | null } | { ok: false; error: string } | null>(null);

  // ログイン・登録を終えて戻ってきたときは、ボタンを押さなくても、そのままつなげる(「LINEで、すぐつながる」を押した時点で、つながる意思は示している)。
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    startTransition(async () => setResult(await connectViaMeetQr(token)));
  }, [autoStart, token]);

  if (result?.ok) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-lg font-bold text-hl-300">つながりました!</p>
        <p className="text-sm text-tone-300">{castName}さんと、おたがいにフォローしあいました。メッセージを送れます。</p>
        {result.castHref && (
          <Link href={result.castHref} className="block rounded-full bg-hl-300 py-4 text-base font-bold text-black">
            {castName}さんのページへ(メッセージを送る)
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await connectViaMeetQr(token)))}
        className="w-full rounded-full bg-hl-300 py-4 text-base font-bold text-black active:scale-[0.99] disabled:opacity-60"
      >
        {pending ? "つながっています…" : `${castName}さんとつながる`}
      </button>
      {result && !result.ok && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{result.error}</p>}
    </div>
  );
}

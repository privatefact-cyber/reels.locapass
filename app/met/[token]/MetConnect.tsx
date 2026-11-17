"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { connectViaMeetQr } from "../actions";

/** 「つながる」ボタン。押すと、FACESをフォローして、FACES側も自動でフォローを返す(DMが開く)。 */
export function MetConnect({ token, castName }: { token: string; castName: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: true; castHref: string | null } | { ok: false; error: string } | null>(null);

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

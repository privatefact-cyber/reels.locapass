"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { rememberMetScan } from "../actions";

/**
 * ログイン前にQRを読んだ人向けの、登録いらずのログイン(初めてのログインで、会員は自動で作られる)。
 * LINE・Googleのどちらかを押すだけ。終わったら、この画面に戻って、そのまま「つながる」まで進む。
 */
export function MetLogin({ token, redirectPath }: { token: string; redirectPath: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(kind: "line" | "google") {
    setBusy(true);
    setError(null);
    await rememberMetScan(token);
    if (kind === "line") {
      window.location.href = `/api/auth/line/start?redirect=${encodeURIComponent(redirectPath)}`;
      return;
    }
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectPath)}` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => start("line")}
        className="w-full rounded-full bg-[#06C755] py-4 text-base font-bold text-white active:scale-[0.99] disabled:opacity-60"
      >
        LINEで、すぐつながる
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => start("google")}
        className="w-full rounded-full border border-main/30 bg-main/5 py-4 text-base font-bold text-main active:scale-[0.99] disabled:opacity-60"
      >
        Googleで、すぐつながる
      </button>
      <p className="text-center text-[11px] text-tone-400">はじめての方も、これだけで登録が終わります(約10秒)。</p>
      {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      <Link
        href={`/mypage/login?redirect=${encodeURIComponent(redirectPath)}`}
        className="block text-center text-xs text-tone-400 underline"
      >
        メールアドレスで、登録・ログインする
      </Link>
    </div>
  );
}

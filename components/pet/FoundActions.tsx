"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { claimFoundReport, resolveFoundReport } from "@/app/pet/actions";
import { petButton } from "./ui";

/** 通報ページの操作。通報した人: 「解決した」。ほかの人: 「うちの子かも!」 */
export function FoundActions({ id, isReporter, loggedIn, resolved }: { id: string; isReporter: boolean; loggedIn: boolean; resolved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [needLost, setNeedLost] = useState(false);

  if (resolved) return null;

  if (isReporter)
    return (
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!confirm("飼い主さんが見つかりましたか?通報を「解決」にします。")) return;
          setBusy(true);
          const res = await resolveFoundReport(id);
          setBusy(false);
          if (!res.ok) return alert(res.error);
          router.refresh();
        }}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#2E9C7C] px-5 py-3 text-sm font-extrabold text-white shadow-[0_4px_0_#22806A]"
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        🎉 飼い主さんが見つかった(解決にする)
      </button>
    );

  if (!loggedIn)
    return (
      <Link href={`/mypage/login?redirect=${encodeURIComponent(`/pet/found/${id}`)}`} className={`${petButton.primary} w-full`}>
        うちの子かも!(ログインして知らせる)
      </Link>
    );

  return (
    <div>
      <button
        type="button"
        disabled={busy || msg !== null}
        onClick={async () => {
          setBusy(true);
          const res = await claimFoundReport(id);
          setBusy(false);
          if (!res.ok) return setMsg(res.error);
          setNeedLost(!res.hasLostReport);
          setMsg(res.hasLostReport ? "通報した人に知らせました。迷子のお知らせに出ている連絡先から連絡が来るはずです。" : "通報した人に知らせました。");
        }}
        className={`${petButton.primary} w-full`}
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        🙋 うちの子かも!
      </button>
      {msg && <p className="mt-2 rounded-2xl bg-[#E5F7F0] px-3 py-2 text-sm font-bold text-[#22806A]">{msg}</p>}
      {needLost && (
        <p className="mt-2 rounded-2xl bg-[#FFF8E1] px-3 py-2 text-xs text-[#8A6A00]">
          相手があなたに連絡できるよう、ワンコ手帳で「迷子のお知らせ」を出して連絡先を入れてください。
          <Link href="/pet" className="ml-1 font-extrabold underline">
            うちの子から出す
          </Link>
        </p>
      )}
    </div>
  );
}

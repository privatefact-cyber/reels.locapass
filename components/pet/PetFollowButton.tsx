"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, Loader2 } from "lucide-react";
import { cancelPetFollow, requestPetFollow } from "@/app/pet/actions";
import { petButton } from "./ui";

/**
 * 犬用フォロー(飼い主の承認制)。未ログインの人には、会員登録(またはアプリ)をすすめる。
 */
export function PetFollowButton({ petId, petName, initial, loggedIn, back }: { petId: string; petName: string; initial: "pending" | "approved" | null; loggedIn: boolean; back: string }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [askSignup, setAskSignup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!loggedIn) return setAskSignup(true);
    setBusy(true);
    setError(null);
    if (status) {
      if (!confirm(status === "pending" ? "フォローの申請を取り消しますか?" : `${petName}ちゃんのフォローをやめますか?`)) return setBusy(false);
      const res = await cancelPetFollow(petId);
      if (res.ok) setStatus(null);
      else setError(res.error);
    } else {
      const res = await requestPetFollow(petId);
      if (res.ok) setStatus(res.status);
      else setError(res.error);
    }
    setBusy(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={status === "approved" ? `${petButton.soft} w-full` : status === "pending" ? "inline-flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[#F1E1CF] bg-white px-4 py-2.5 text-sm font-bold text-[#9C8273]" : `${petButton.primary} w-full`}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Heart size={18} fill={status === "approved" ? "currentColor" : "none"} />}
        {status === "approved" ? "フォロー中" : status === "pending" ? "承認待ち(タップで取り消し)" : `${petName}ちゃんをフォロー`}
      </button>
      {status === "pending" && <p className="mt-1 text-center text-xs text-[#B39C8C]">飼い主さんが承認するとフォローできます</p>}
      {error && <p className="mt-1 text-center text-sm font-bold text-[#D04848]">{error}</p>}

      {askSignup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4" onClick={() => setAskSignup(false)}>
          <div className="w-full max-w-md rounded-[32px] bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-5xl" aria-hidden>
              🐶💛🐶
            </p>
            <p className="mt-3 text-lg font-extrabold">{petName}ちゃんとつながろう</p>
            <p className="mt-1 text-sm text-[#7A6050]">
              ワンコ同士でフォローするには、LOCAPASSの会員登録(無料)が必要です。
              <br />
              登録すると、あなたの子の手帳や迷子タグも使えます。
            </p>
            <Link href={`/mypage/login?redirect=${encodeURIComponent(back)}`} className={`${petButton.primary} mt-4 w-full`}>
              無料で会員登録 / ログイン
            </Link>
            <p className="mt-3 text-xs text-[#B39C8C]">スマホアプリ版も準備中です</p>
            <button type="button" onClick={() => setAskSignup(false)} className={`${petButton.ghost} mt-1`}>
              あとで
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

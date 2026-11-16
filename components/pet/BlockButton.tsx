"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { blockPetAuthor } from "@/app/pet/blockActions";
import { petButton } from "./ui";

/** 投稿した人のブロック(2段階の確認つき)。ブロックすると、この人の投稿は自分の画面に出なくなる。 */
export function BlockButton({ targetType, targetId, loggedIn }: { targetType: "lost" | "found" | "diary"; targetId: string; loggedIn: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await blockPetAuthor(targetType, targetId);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    // ブロックしたので、この投稿はもう見られない。一覧へもどる
    router.push(targetType === "diary" ? "/pet/gallery" : "/pet/lost");
    router.refresh();
  }

  if (!confirming) {
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={() => (loggedIn ? setConfirming(true) : (location.href = `/pet/login?redirect=${encodeURIComponent(location.pathname + location.search)}`))}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#C9B3A3]"
        >
          <Ban size={12} />
          この投稿者をブロック
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#F1E1CF] bg-white p-3 text-center">
      <p className="text-[13px] font-bold text-[#4A3426]">この投稿者をブロックしますか?</p>
      <p className="mt-1 text-[12px] leading-relaxed text-[#7A6050]">この人の投稿は、あなたの画面に表示されなくなります。ブロックは、設定からいつでも解除できます。</p>
      {error && <p className="mt-2 text-sm font-bold text-[#D04848]">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" className={`${petButton.ghost} flex-1`} onClick={() => setConfirming(false)} disabled={busy}>
          やめる
        </button>
        <button type="button" className={`${petButton.danger} flex-1`} onClick={run} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
          ブロックする
        </button>
      </div>
    </div>
  );
}

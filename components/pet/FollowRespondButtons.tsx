"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { respondPetFollow } from "@/app/pet/actions";

export function FollowRespondButtons({ followId, mode }: { followId: string; mode: "request" | "follower" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"ok" | "no" | null>(null);
  async function run(approve: boolean) {
    if (!approve && mode === "follower" && !confirm("このフォロワーを外しますか?")) return;
    setBusy(approve ? "ok" : "no");
    const res = await respondPetFollow(followId, approve);
    setBusy(null);
    if (!res.ok) return alert(res.error);
    router.refresh();
  }
  if (mode === "follower")
    return (
      <button type="button" onClick={() => run(false)} disabled={busy !== null} className="rounded-full px-3 py-1.5 text-xs font-bold text-[#C9B3A3]">
        {busy ? <Loader2 size={14} className="animate-spin" /> : "外す"}
      </button>
    );
  return (
    <div className="flex shrink-0 gap-1.5">
      <button type="button" onClick={() => run(true)} disabled={busy !== null} className="rounded-full bg-[#FF8E5E] px-3.5 py-2 text-xs font-extrabold text-white shadow-[0_2px_0_#EE6A36]">
        {busy === "ok" ? <Loader2 size={14} className="animate-spin" /> : "承認"}
      </button>
      <button type="button" onClick={() => run(false)} disabled={busy !== null} className="rounded-full bg-[#F4EEE8] px-3 py-2 text-xs font-bold text-[#9C8273]">
        {busy === "no" ? <Loader2 size={14} className="animate-spin" /> : "お断り"}
      </button>
    </div>
  );
}

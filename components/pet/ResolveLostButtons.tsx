"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { resolveLostReport } from "@/app/pet/actions";
import { petButton } from "./ui";

export function ResolveLostButtons({ reportId, petName }: { reportId: string; petName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"found" | "closed" | null>(null);
  async function run(outcome: "found" | "closed") {
    const msg = outcome === "found" ? `${petName}ちゃんが見つかりましたか?お知らせを終わらせ、公開していた連絡先を消します。` : "迷子のお知らせを終わらせ、公開していた連絡先を消します。よろしいですか?";
    if (!confirm(msg)) return;
    setBusy(outcome);
    const res = await resolveLostReport(reportId, outcome);
    setBusy(null);
    if (!res.ok) return alert(res.error);
    router.refresh();
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => run("found")} disabled={busy !== null} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#4FBF9F] px-4 py-3 text-sm font-extrabold text-white shadow-[0_4px_0_#33997C] active:translate-y-[2px]">
        {busy === "found" && <Loader2 size={16} className="animate-spin" />}
        🎉 見つかった!
      </button>
      <button type="button" onClick={() => run("closed")} disabled={busy !== null} className={petButton.soft}>
        {busy === "closed" && <Loader2 size={16} className="animate-spin" />}
        お知らせを終える
      </button>
    </div>
  );
}

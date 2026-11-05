"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { confirmLostReport } from "@/app/pet/actions";

/** 「まだ探しています」: 迷子のお知らせの自動終了までの期限を延ばす */
export function ConfirmLostButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await confirmLostReport(reportId);
        setBusy(false);
        if (!res.ok) return alert(res.error);
        router.refresh();
      }}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#FF8E5E] px-4 py-3 text-sm font-extrabold text-white shadow-[0_4px_0_#EE6A36]"
    >
      {busy && <Loader2 size={16} className="animate-spin" />}
      まだ探しています(期限を延ばす)
    </button>
  );
}

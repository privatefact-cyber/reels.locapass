"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMyReservation } from "@/app/mypage/reservations/actions";

export function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("この予約を取り消しますか?(仮決済は解放されます)")) return;
          start(async () => {
            const r = await cancelMyReservation(id);
            if (!r.ok) setErr(r.error);
            else router.refresh();
          });
        }}
        className="rounded-lg border border-red-400/60 px-3 py-1.5 text-xs font-bold text-red-300 disabled:opacity-50"
      >
        {pending ? "処理中..." : "予約を取り消す"}
      </button>
      {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
    </div>
  );
}

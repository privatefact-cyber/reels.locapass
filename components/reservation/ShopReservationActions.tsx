"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondAction, settleAction } from "@/app/dashboard/shop/[shopId]/reservations/actions";
import { DEPOSIT_AMOUNT } from "@/lib/reservation/config";

/** 返答待ち: ワンタップで「受ける(確定)」/「断る(仮決済を解放)」。 */
export function RespondButtons({ shopId, id }: { shopId: string; id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (accept: boolean) =>
    start(async () => {
      if (!accept && !confirm("断りますか?(お客様の仮決済は解放され、請求は0円になります)")) return;
      const r = await respondAction(shopId, id, accept, msg || null);
      if (!r.ok) setErr(r.error);
      else router.refresh();
    });
  return (
    <div className="space-y-2">
      <input value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={300} placeholder="お客様へ一言(任意)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={pending} onClick={() => run(true)} className="rounded-xl bg-emerald-600 py-3.5 text-base font-black text-white disabled:opacity-50 active:scale-95">受ける(確定)</button>
        <button type="button" disabled={pending} onClick={() => run(false)} className="rounded-xl bg-slate-200 py-3.5 text-base font-black text-slate-800 disabled:opacity-50 active:scale-95">断る</button>
      </div>
      {err && <p className="text-xs font-semibold text-red-600">{err}</p>}
    </div>
  );
}

/** 予約時刻を過ぎた確定予約: 来店(枠を解放)/ 来店(会計に充当)/ ドタキャン(没収)。 */
export function SettleButtons({ shopId, id }: { shopId: string; id: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (kind: "arrived" | "applied" | "no_show", ask: string) =>
    start(async () => {
      if (!confirm(ask)) return;
      const r = await settleAction(shopId, id, kind);
      if (!r.ok) setErr(r.error);
      else router.refresh();
    });
  const d = DEPOSIT_AMOUNT.toLocaleString();
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button type="button" disabled={pending} onClick={() => run("arrived", "ご来店として処理し、仮決済を解放します(お客様の請求は0円・お会計は現地で全額)。")} className="rounded-lg bg-sky-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">来店(枠を解放)</button>
        <button type="button" disabled={pending} onClick={() => run("applied", `ご来店として処理し、デポジット${d}円を売上として確定します(お会計から${d}円を差し引いてください)。`)} className="rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">来店(会計に充当)</button>
        <button type="button" disabled={pending} onClick={() => run("no_show", `無断キャンセルとして、デポジット${d}円をお店の売上として確定(没収)します。取り消せません。`)} className="rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">ドタキャン(没収)</button>
      </div>
      {err && <p className="text-xs font-semibold text-red-600">{err}</p>}
    </div>
  );
}

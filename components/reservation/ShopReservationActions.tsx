"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FREE_CANCEL_CHOICES } from "@/lib/reservation/config";
import { respondAction, settleAction, updatePolicyAction } from "@/app/dashboard/shop/[shopId]/reservations/actions";

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

/**
 * 確定済み/判断待ちの予約に対する、店舗のワンタップ判断。
 *  - 「請求なし」(神対応・枠を解放) / 「キャンセル料を請求」は、事前連絡があった場合や直前キャンセルの判断で、いつでも押せる。
 *  - 予約時刻を過ぎたら「来店した」「無断キャンセル」も押せる。
 */
export function SettleButtons({ shopId, id, deposit, started, review }: { shopId: string; id: string; deposit: number; started: boolean; review: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (kind: "arrived" | "no_show" | "waive" | "charge", ask: string) =>
    start(async () => {
      if (!confirm(ask)) return;
      const r = await settleAction(shopId, id, kind);
      if (!r.ok) return setErr(r.error);
      if (r.warning) setWarn(r.warning);
      else router.refresh();
    });
  const d = deposit.toLocaleString();
  const btn = "rounded-lg py-3 text-sm font-bold text-white disabled:opacity-50 active:scale-95";
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={pending} onClick={() => run("waive", "キャンセル料なしで承ります。枠(保存カード)を解放し、請求は0円です。お客様にも通知します。")} className={`${btn} bg-emerald-600`}>
          請求なし(神対応)
        </button>
        <button type="button" disabled={pending} onClick={() => run("charge", `キャンセル料としてデポジット${d}円をお客様のカードに請求します。取り消せません。よろしいですか?`)} className={`${btn} bg-orange-600`}>
          キャンセル料を請求({d}円)
        </button>
        {started && !review && (
          <>
            <button type="button" disabled={pending} onClick={() => run("arrived", "ご来店として処理します。枠(保存カード)を解放し、請求は0円です。お会計は現地で全額お願いします。")} className={`${btn} bg-sky-600`}>
              来店した
            </button>
            <button type="button" disabled={pending} onClick={() => run("no_show", `連絡のない無断キャンセルとして、デポジット${d}円を請求します。取り消せません。よろしいですか?`)} className={`${btn} bg-red-600`}>
              無断キャンセル(請求)
            </button>
          </>
        )}
      </div>
      <p className="text-[11px] text-slate-500">来店から24時間以内に処理しない場合は、請求なしで自動的に解放されます(自動で請求はしません)。</p>
      {err && <p className="text-xs font-semibold text-red-600">{err}</p>}
      {warn && (
        <p className="text-xs font-semibold text-red-600">
          {warn} <button type="button" onClick={() => router.refresh()} className="underline">閉じる</button>
        </p>
      )}
    </div>
  );
}

/** お客様が無料で取り消せる期限(来店のN時間前まで)の設定。 */
export function PolicyForm({ shopId, hours }: { shopId: string; hours: number }) {
  const router = useRouter();
  const [v, setV] = useState(hours);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select value={v} onChange={(e) => setV(Number(e.target.value))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900">
          {FREE_CANCEL_CHOICES.map((h) => (
            <option key={h} value={h}>{h === 0 ? "来店時刻まで" : `来店の${h}時間前まで`}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || v === hours}
          onClick={() => start(async () => { const r = await updatePolicyAction(shopId, v); setMsg(r.ok ? "保存しました" : r.error); if (r.ok) router.refresh(); })}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          保存
        </button>
      </div>
      {msg && <p className="text-xs text-slate-600">{msg}</p>}
    </div>
  );
}

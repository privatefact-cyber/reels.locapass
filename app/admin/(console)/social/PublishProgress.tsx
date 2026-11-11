"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Row = { id: string; platform: "threads" | "instagram"; account: "locapass" | "luxela"; status: string; error: string | null; hasVideo: boolean; hasContainer: boolean; elapsedMs: number | null };

const NAME = (r: Row) => `${r.platform === "instagram" ? "Instagram" : "Threads"}(${r.account === "luxela" ? "LUXELA" : "LOCAPASS"})`;
const isDone = (r: Row) => r.status === "posted" || r.status === "failed" || r.status === "discarded" || (Boolean(r.error) && r.status !== "processing");

/**
 * 進み具合の目安(%)。Meta側は「処理中/完了」しか教えてくれないので、
 * 段階(準備→動画を送る→処理待ち→公開)と、処理に入ってからの経過時間から見積もる。
 * 処理待ちは、実測で30〜60秒なので、そこに向けてゆっくり進める(完了までは92%で止める)。
 */
function estimate(r: Row, localMs: number): { pct: number; text: string } {
  if (r.status === "posted") return { pct: 100, text: "公開しました" };
  if (r.status === "failed" || (r.error && r.status !== "processing")) return { pct: 100, text: "失敗しました" };
  if (r.status === "processing") {
    if (!r.hasContainer) return { pct: 12, text: "動画をInstagram・Threadsに送っています" };
    const t = (r.elapsedMs ?? 0) + localMs;
    return { pct: Math.min(92, Math.round(20 + 72 * (1 - Math.exp(-t / 30_000)))), text: "Instagram・Threadsが動画を処理しています" };
  }
  // draft / scheduled: 投稿を始めたところ
  return { pct: Math.min(15, 4 + Math.round(localMs / 400)), text: "投稿の準備をしています" };
}

export function PublishProgress({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [tracked, setTracked] = useState<string[]>(ids);
  const [rows, setRows] = useState<Row[]>([]);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [, tick] = useState(0);
  const [failures, setFailures] = useState(0);
  const refreshed = useRef(false);
  const startedAt = useRef(Date.now());

  useEffect(() => { setTracked((cur) => [...new Set([...cur, ...ids])]); }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const allDone = rows.length > 0 && rows.length >= tracked.length && rows.every(isDone);

  useEffect(() => {
    if (!tracked.length || allDone) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/social/progress?ids=${tracked.join(",")}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { rows: Row[] };
        if (!stop) { setRows(json.rows); setFetchedAt(Date.now()); setFailures(0); }
      } catch {
        if (!stop) setFailures((n) => n + 1);
      }
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => { stop = true; clearInterval(t); };
  }, [tracked.join(","), allDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // なめらかに動かすため、1秒ごとに再描画する
  useEffect(() => {
    if (allDone) return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [allDone]);

  // 全部終わったら、一覧(下書き・履歴)を最新にする
  useEffect(() => {
    if (allDone && !refreshed.current) { refreshed.current = true; router.refresh(); }
  }, [allDone, router]);

  if (!tracked.length) return null;
  const localMs = Date.now() - fetchedAt;
  const waitedSec = Math.round((Date.now() - startedAt.current) / 1000);

  return (
    <section aria-live="polite" className="space-y-3 rounded-xl border border-emerald-300 bg-white p-4">
      <p className="text-sm font-bold text-slate-900">{allDone ? "投稿の結果" : `投稿中です(${waitedSec}秒経過)。このページを開いたままお待ちください`}</p>
      {rows.length === 0 && <p className="text-xs text-slate-600">状況を確認しています…</p>}
      {rows.map((r) => {
        const e = estimate(r, localMs);
        const failed = e.text === "失敗しました";
        return (
          <div key={r.id} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800">{NAME(r)}</span>
              <span className={failed ? "font-bold text-red-700" : "text-slate-700"}>{e.text} ・ {isDone(r) ? (failed ? "—" : "100%") : `約${e.pct}%`}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={e.pct}>
              <div className={`h-full rounded-full transition-all duration-500 ${failed ? "bg-red-500" : e.pct >= 100 ? "bg-emerald-600" : "bg-emerald-500"}`} style={{ width: `${e.pct}%` }} />
            </div>
            {r.error && <p className="text-xs text-red-800">理由: {r.error}</p>}
          </div>
        );
      })}
      {!allDone && <p className="text-[11px] text-slate-500">%は目安です(動画の処理は、相手側が終わるまで正確には分かりません。いつも30〜60秒ほどです)。</p>}
      {failures >= 3 && !allDone && <p className="text-xs text-amber-800">状況の取得に失敗しています。通信を確認してください(投稿そのものは裏で続いています)。</p>}
    </section>
  );
}

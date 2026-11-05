"use client";

import { useMemo, useState } from "react";
import { YoutubeStockCard } from "./YoutubeStockCard";

type Row = Parameters<typeof YoutubeStockCard>[0]["row"];
type Status = "all" | "pending" | "matched_existing" | "ready_to_create" | "rejected";
type Action = (formData: FormData) => void | Promise<void>;
type RowActions = {
  findOfficialSite: Action;
  review: Action;
  createDraft: Action;
  publish: Action;
};

export function YoutubeStockGrid({ rows, shopName, portalOptions, actions }: {
  rows: Row[];
  shopName: Record<string, string>;
  portalOptions: { id: number; label: string }[];
  actions: Record<string, RowActions>;
}) {
  const [provider, setProvider] = useState<"all" | "youtube" | "tiktok">("all");
  const [status, setStatus] = useState<Status>("all");
  const counts = useMemo(() => rows.reduce<Record<string, number>>((result, row) => {
    result[row.match_status] = (result[row.match_status] ?? 0) + 1;
    return result;
  }, {}), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    const matchesStatus = status === "all" || row.match_status === status;
    const matchesProvider = provider === "all" || row.source_provider === provider;
    return matchesStatus && matchesProvider;
  }), [provider, rows, status]);
  const statusFilters = [
    ["all", `候補 ${rows.length}`, "bg-slate-100 text-slate-800"],
    ["pending", `保留 ${counts.pending ?? 0}`, "bg-amber-100 text-amber-900"],
    ["matched_existing", `既存店 ${counts.matched_existing ?? 0}`, "bg-emerald-100 text-emerald-900"],
    ["ready_to_create", `新規準備 ${counts.ready_to_create ?? 0}`, "bg-blue-100 text-blue-900"],
    ["rejected", `除外 ${counts.rejected ?? 0}`, "bg-slate-200 text-slate-800"],
  ] as const;
  return <>
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-slate-600">状態:</span>{statusFilters.map(([value, label, color]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={`rounded-full border px-3 py-1 transition ${status === value ? "border-slate-900 ring-2 ring-slate-900 ring-offset-1" : "border-transparent hover:border-slate-400"} ${color}`}>{label}</button>)}</div>
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-slate-600">表示:</span>{([['all', `すべて ${rows.length}`], ['youtube', `YouTube ${rows.filter((row) => row.source_provider === 'youtube').length}`], ['tiktok', `TikTok ${rows.filter((row) => row.source_provider === 'tiktok').length}`]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setProvider(value)} className={`rounded-full border px-3 py-1 ${provider === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{label}</button>)}</div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((row) => {
      const rowActions = actions[row.id];
      return rowActions ? <YoutubeStockCard key={row.id} row={row} shopLabel={row.matched_shop_id ? shopName[row.matched_shop_id] : undefined} portalOptions={portalOptions} {...rowActions} /> : null;
    })}</div>
    {filtered.length === 0 && <p className="text-sm text-slate-500">該当する動画はありません。</p>}
  </>;
}

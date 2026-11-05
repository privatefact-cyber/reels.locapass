"use client";

import { useMemo, useState } from "react";
import { YoutubeStockCard } from "./YoutubeStockCard";

type Row = Parameters<typeof YoutubeStockCard>[0]["row"];
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
  const filtered = useMemo(() => provider === "all" ? rows : rows.filter((row) => row.source_provider === provider), [provider, rows]);
  return <>
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-slate-600">表示:</span>{([['all', `すべて ${rows.length}`], ['youtube', `YouTube ${rows.filter((row) => row.source_provider === 'youtube').length}`], ['tiktok', `TikTok ${rows.filter((row) => row.source_provider === 'tiktok').length}`]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setProvider(value)} className={`rounded-full border px-3 py-1 ${provider === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{label}</button>)}</div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((row) => {
      const rowActions = actions[row.id];
      return rowActions ? <YoutubeStockCard key={row.id} row={row} shopLabel={row.matched_shop_id ? shopName[row.matched_shop_id] : undefined} portalOptions={portalOptions} {...rowActions} /> : null;
    })}</div>
  </>;
}

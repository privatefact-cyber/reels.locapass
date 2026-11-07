"use client";

import { useMemo, useState } from "react";
import { YoutubeStockCard } from "./YoutubeStockCard";
import { setYoutubeStockRejected } from "../youtube-intake/actions";

type Row = Parameters<typeof YoutubeStockCard>[0]["row"];
type Status = "all" | "pending" | "matched_existing" | "ready_to_create" | "rejected";
type Publication = "all" | "unpublished" | "published";
type Action = (formData: FormData) => void | Promise<void>;
type RowActions = {
  findOfficialSite: Action;
  review: Action;
  createDraft: Action;
  publish: Action;
  setThumbnail: Action;
};

export function YoutubeStockGrid({ rows, shopName, portalOptions, actions }: {
  rows: Row[];
  shopName: Record<string, string>;
  portalOptions: { id: number; label: string }[];
  actions: Record<string, RowActions>;
}) {
  const [provider, setProvider] = useState<"all" | "youtube" | "tiktok">("all");
  const [status, setStatus] = useState<Status>("all");
  const [publication, setPublication] = useState<Publication>("all");
  // まとめて除外するための選択。表示中の(いまの絞り込みに合う)ものだけが対象になる。
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const counts = useMemo(() => rows.reduce<Record<string, number>>((result, row) => {
    result[row.match_status] = (result[row.match_status] ?? 0) + 1;
    return result;
  }, {}), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    // 「候補」(すべて)の一覧には、除外した動画を出さない(「除外」を選ぶと見られる)。
    const matchesStatus = status === "all" ? row.match_status !== "rejected" : row.match_status === status;
    const matchesProvider = provider === "all" || row.source_provider === provider;
    const matchesPublication = publication === "all" || (publication === "published" ? Boolean(row.reel_id) : !row.reel_id);
    return matchesStatus && matchesProvider && matchesPublication;
  }), [provider, publication, rows, status]);
  // 数の表示は、いま見ている一覧(除外タブなら除外、それ以外は除外を除いたもの)に合わせる。
  const activeRows = rows.filter((row) => row.match_status !== "rejected");
  const scoped = status === "rejected" ? rows : activeRows;
  const statusFilters = [
    ["all", `候補 ${activeRows.length}`, "bg-slate-100 text-slate-800"],
    ["pending", `保留 ${counts.pending ?? 0}`, "bg-amber-100 text-amber-900"],
    ["matched_existing", `既存店 ${counts.matched_existing ?? 0}`, "bg-emerald-100 text-emerald-900"],
    ["ready_to_create", `新規準備 ${counts.ready_to_create ?? 0}`, "bg-blue-100 text-blue-900"],
    ["rejected", `除外 ${counts.rejected ?? 0}`, "bg-slate-200 text-slate-800"],
  ] as const;
  const publishedCount = scoped.filter((row) => row.reel_id).length;
  const publicationFilters = [
    ["all", `すべて ${scoped.length}`],
    ["unpublished", `未投稿 ${scoped.length - publishedCount}`],
    ["published", `公開済み ${publishedCount}`],
  ] as const;
  // 選べるのは、除外タブでは除外済みのもの(取り消し用)、それ以外では公開済みでないもの(公開は取り消さない)。
  const restoring = status === "rejected";
  const selectable = (row: Row) => (restoring ? row.match_status === "rejected" : !row.reel_id && row.match_status !== "rejected");
  const selectableRows = filtered.filter(selectable);
  const picked = selectableRows.filter((row) => selected.has(row.id));
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const run = async (ids: string[], rejected: boolean) => {
    if (ids.length === 0) return;
    setBusy(true);
    setBulkError(null);
    try {
      await setYoutubeStockRejected(ids, rejected);
      setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  };
  return <>
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-slate-600">状態:</span>{statusFilters.map(([value, label, color]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={`rounded-full border px-3 py-1 transition ${status === value ? "border-slate-900 ring-2 ring-slate-900 ring-offset-1" : "border-transparent hover:border-slate-400"} ${color}`}>{label}</button>)}</div>
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-slate-600">投稿:</span>{publicationFilters.map(([value, label]) => <button key={value} type="button" aria-pressed={publication === value} onClick={() => setPublication(value)} className={`rounded-full border px-3 py-1 transition ${publication === value ? "border-emerald-700 bg-emerald-700 text-white" : "border-emerald-200 bg-white text-emerald-800 hover:border-emerald-500"}`}>{label}</button>)}</div>
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-slate-600">表示:</span>{([['all', `すべて ${scoped.length}`], ['youtube', `YouTube ${scoped.filter((row) => row.source_provider === 'youtube').length}`], ['tiktok', `TikTok ${scoped.filter((row) => row.source_provider === 'tiktok').length}`]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setProvider(value)} className={`rounded-full border px-3 py-1 ${provider === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{label}</button>)}</div>
    {bulkError && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{bulkError}</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((row) => {
      const rowActions = actions[row.id];
      if (!rowActions) return null;
      const isPicked = selected.has(row.id);
      return <div key={row.id} className={`relative rounded-2xl ${isPicked ? "ring-4 ring-slate-900" : ""}`}>
        {selectable(row) && <label className="absolute left-3 top-3 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/95 shadow-md"><input type="checkbox" checked={isPicked} onChange={() => toggle(row.id)} aria-label="この動画を選ぶ" className="h-5 w-5 accent-slate-900" /></label>}
        <YoutubeStockCard row={row} shopLabel={row.matched_shop_id ? shopName[row.matched_shop_id] : undefined} portalOptions={portalOptions} {...rowActions} onToggleReject={row.match_status === "rejected" ? () => run([row.id], false) : !row.reel_id ? () => run([row.id], true) : undefined} />
      </div>;
    })}</div>
    {filtered.length === 0 && <p className="text-sm text-slate-500">該当する動画はありません。</p>}
    {selectableRows.length > 0 && (
      <div className="sticky bottom-20 z-30 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-300 bg-white/95 px-4 py-3 shadow-lg backdrop-blur md:bottom-4">
        <span className="text-sm font-semibold text-slate-700">{picked.length}本を選択中</span>
        <button type="button" disabled={busy} onClick={() => setSelected((prev) => { const next = new Set(prev); selectableRows.forEach((row) => next.add(row.id)); return next; })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">表示中の{selectableRows.length}本をすべて選ぶ</button>
        {picked.length > 0 && <button type="button" disabled={busy} onClick={() => setSelected((prev) => { const next = new Set(prev); picked.forEach((row) => next.delete(row.id)); return next; })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">選択を外す</button>}
        <button type="button" disabled={busy || picked.length === 0} onClick={() => run(picked.map((row) => row.id), restoring)} className={`ml-auto rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${restoring ? "bg-slate-700" : "bg-red-600"}`}>{busy ? "処理中…" : restoring ? `除外を取り消す(${picked.length}本)` : `除外する(${picked.length}本)`}</button>
      </div>
    )}
  </>;
}

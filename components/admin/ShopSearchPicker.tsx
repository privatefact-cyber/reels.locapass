"use client";

import { useEffect, useRef, useState } from "react";

export type ShopHit = { id: string; name: string; sub: string | null; embedEnabled: boolean };

/**
 * 店舗名で検索して1店舗を選ぶ入力欄(店舗が何千・何万件あっても使える)。選んだ店舗のIDを name の隠し欄で送る。
 * search はサーバー側の検索(上位30件まで)。
 */
export function ShopSearchPicker({
  name,
  search,
  placeholder = "店舗名で検索",
  showOption = false,
}: {
  name: string;
  search: (q: string) => Promise<ShopHit[]>;
  placeholder?: string;
  /** 結果に「オン/オフ」の状態を出す(オプション設定用)。 */
  showOption?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ShopHit[]>([]);
  const [selected, setSelected] = useState<ShopHit | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (selected) return;
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await search(q.trim());
        if (my === seq.current) setHits(r);
      } finally {
        if (my === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, selected, search]);

  if (selected) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900">
        <input type="hidden" name={name} value={selected.id} />
        <span className="min-w-0 flex-1 truncate font-semibold">
          {selected.name}
          {selected.sub ? <span className="ml-1 font-normal text-slate-500">({selected.sub})</span> : null}
          {showOption && (
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${selected.embedEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
              {selected.embedEnabled ? "いまオン" : "いまオフ"}
            </span>
          )}
        </span>
        <button type="button" onClick={() => { setSelected(null); setQ(""); setOpen(true); }} className="shrink-0 text-xs text-slate-500 underline hover:text-slate-900">
          変更
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-w-0 flex-1">
      {/* 未選択のまま送信されないよう、見えない必須欄を置く。 */}
      <input tabIndex={-1} aria-hidden required value="" onChange={() => {}} className="pointer-events-none absolute inset-0 opacity-0" />
      <input
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-500"
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && hits.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">検索中...</li>}
          {!loading && hits.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">該当する店舗がありません</li>}
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => { setSelected(h); setOpen(false); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100"
              >
                <span className="min-w-0 truncate">
                  {h.name}
                  {h.sub ? <span className="ml-1 text-slate-500">({h.sub})</span> : null}
                </span>
                {showOption && h.embedEnabled && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">オン</span>}
              </button>
            </li>
          ))}
          {hits.length >= 30 && <li className="px-3 py-2 text-[11px] text-slate-500">上位30件を表示中。さらに絞るには、店舗名を続けて入力してください。</li>}
        </ul>
      )}
    </div>
  );
}

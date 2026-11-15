"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ShopHit } from "@/components/admin/ShopSearchPicker";
import { SHOP_OPTIONS } from "@/lib/shop-options";

type Row = { shopId: string; name: string; sub: string | null; enabled: Record<string, boolean> };
type Choice = "keep" | "on" | "off";

/**
 * 店舗を検索して、1店舗でも複数店舗でも選び、オプションをまとめて更新する画面。
 * - 店舗: 検索結果のチェックボックスで選ぶ(選んだ店舗は上に並ぶ)。
 * - オプション: 「変更しない / オンにする / オフにする」から選ぶ。
 * - 「更新する」を押すと反映し、保存後にデータベースを読み直した本当の状態を、店舗ごとに表示する。
 */
export function ShopOptionsEditor({
  search,
  load,
  apply,
}: {
  search: (q: string) => Promise<ShopHit[]>;
  load: (shopIds: string[]) => Promise<Row[]>;
  apply: (shopIds: string[], changes: { key: string; enabled: boolean }[]) => Promise<Row[]>;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ShopHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Map<string, ShopHit>>(new Map());
  const [rows, setRows] = useState<Row[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string; at?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await search(q.trim());
        if (my === seq.current) setHits(r);
      } finally {
        if (my === seq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, search]);

  // 選んだ店舗が変わったら、いまの状態を読み直す。
  const key = [...selected.keys()].sort().join(",");
  useEffect(() => {
    if (!key) {
      setRows([]);
      return;
    }
    let alive = true;
    void load(key.split(",")).then((r) => alive && setRows(r)).catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [key, load]);

  function toggleShop(h: ShopHit) {
    setResult(null);
    setSelected((m) => {
      const n = new Map(m);
      if (n.has(h.id)) n.delete(h.id);
      else n.set(h.id, h);
      return n;
    });
  }
  function selectAllShown() {
    setResult(null);
    setSelected((m) => {
      const n = new Map(m);
      for (const h of hits) n.set(h.id, h);
      return n;
    });
  }

  const changes = SHOP_OPTIONS.flatMap((o) => (choices[o.key] === "on" ? [{ key: o.key, enabled: true }] : choices[o.key] === "off" ? [{ key: o.key, enabled: false }] : []));

  function onApply() {
    setResult(null);
    startTransition(async () => {
      try {
        const r = await apply([...selected.keys()], changes);
        setRows(r);
        setChoices({});
        const names = changes.map((c) => `「${SHOP_OPTIONS.find((o) => o.key === c.key)?.label}」を${c.enabled ? "オン" : "オフ"}`).join("、");
        setResult({ ok: true, text: `反映されました! ${r.length}店舗に、${names}にしました。下の一覧は、保存後に読み直した実際の状態です。`, at: new Date().toLocaleTimeString("ja-JP") });
      } catch (e) {
        setResult({ ok: false, text: e instanceof Error ? e.message : "更新できませんでした" });
      }
    });
  }

  const count = (optKey: string, on: boolean) => rows.filter((r) => Boolean(r.enabled[optKey]) === on).length;

  return (
    <div className="space-y-5">
      {/* 1. 店舗を選ぶ */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">1. 店舗を選ぶ(複数選べます)</h3>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="店舗名で検索"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        />
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{searching ? "検索中…" : `${hits.length}件`}</span>
          {hits.length > 0 && (
            <button type="button" onClick={selectAllShown} className="text-blue-600 hover:underline">
              表示中の店舗をすべて選ぶ
            </button>
          )}
          {selected.size > 0 && (
            <button type="button" onClick={() => setSelected(new Map())} className="text-slate-500 hover:underline">
              選択をすべて外す
            </button>
          )}
        </div>
        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {hits.map((h) => (
            <li key={h.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggleShop(h)} className="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate text-slate-900">{h.name}</span>
                {h.sub && <span className="shrink-0 text-xs text-slate-500">{h.sub}</span>}
              </label>
            </li>
          ))}
          {hits.length === 0 && !searching && <li className="px-3 py-3 text-xs text-slate-500">該当する店舗がありません</li>}
        </ul>
        {selected.size > 0 && (
          <p className="text-xs font-semibold text-slate-700">選んだ店舗: {selected.size}店舗({[...selected.values()].slice(0, 4).map((s) => s.name).join("、")}{selected.size > 4 ? " ほか" : ""})</p>
        )}
      </div>

      {/* 2. オプションを選ぶ */}
      {selected.size > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900">2. オプションを選ぶ</h3>
          {SHOP_OPTIONS.map((o) => (
            <div key={o.key} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{o.label}</span>
                <span className="text-[11px] text-slate-500">いま: オン {count(o.key, true)} / オフ {count(o.key, false)}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{o.description}</p>
              <div className="mt-2 flex gap-4 text-sm">
                {(["keep", "on", "off"] as const).map((c) => (
                  <label key={c} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name={`opt-${o.key}`}
                      checked={(choices[o.key] ?? "keep") === c}
                      onChange={() => {
                        setResult(null);
                        setChoices((m) => ({ ...m, [o.key]: c }));
                      }}
                    />
                    {c === "keep" ? "変更しない" : c === "on" ? "オンにする" : "オフにする"}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onApply}
              disabled={pending || changes.length === 0}
              className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              {pending ? "更新中…" : `更新する(${selected.size}店舗)`}
            </button>
            {changes.length === 0 && <span className="text-xs text-slate-500">オンまたはオフにするオプションを選ぶと、押せます</span>}
          </div>
        </div>
      )}

      {result && (
        <div className={`rounded-lg border p-3 text-sm ${result.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-700"}`} role="status">
          <p className="font-semibold">{result.text}</p>
          {result.at && <p className="mt-0.5 text-xs opacity-80">{result.at} に更新</p>}
        </div>
      )}

      {/* 3. いまの実際の状態(保存後に読み直した値) */}
      {rows.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900">いまの状態(データベースから読み直した値)</h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">店舗</th>
                  {SHOP_OPTIONS.map((o) => (
                    <th key={o.key} className="px-3 py-2 font-semibold">{o.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.shopId}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{r.name}{r.sub ? <span className="ml-1 font-normal text-slate-500">({r.sub})</span> : null}</td>
                    {SHOP_OPTIONS.map((o) => (
                      <td key={o.key} className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.enabled[o.key] ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {r.enabled[o.key] ? "オン" : "オフ"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setSiteTheme } from "@/app/admin/(console)/portals/actions";
import type { SiteTheme } from "@/lib/theme";

const OPTIONS: { value: SiteTheme | null; label: string; swatch: string }[] = [
  { value: null, label: "自動", swatch: "linear-gradient(135deg, #d4af6a 50%, #e11d48 50%)" },
  { value: "default", label: "通常(ゴールド)", swatch: "linear-gradient(135deg, #000 50%, #d4af6a 50%)" },
  { value: "christmas", label: "クリスマス", swatch: "linear-gradient(135deg, #881337 50%, #fde68a 50%)" },
  { value: "beauty", label: "ビューティー", swatch: "linear-gradient(135deg, #faf7f5 50%, #e879a0 50%)" },
  { value: "nature", label: "ネイチャー", swatch: "linear-gradient(135deg, #4a5d23 50%, #d4af6a 50%)" },
];

const LABELS: Record<SiteTheme, string> = { default: "通常(ゴールド)", christmas: "クリスマス", beauty: "ビューティー", nature: "ネイチャー" };

/** サイト全体の配色テーマを選ぶ運営専用の切り替え。押すと公開サイトに即時反映される。 */
export function SiteThemeSelector({ current, effective }: { current: SiteTheme | null; effective: SiteTheme }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(value: SiteTheme | null) {
    if (value === current) return;
    setError(null);
    startTransition(async () => {
      try {
        await setSiteTheme(value);
      } catch (e) {
        setError(e instanceof Error ? e.message : "配色テーマの変更に失敗しました");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((o) => {
          const active = o.value === current;
          return (
            <button
              key={o.label}
              type="button"
              onClick={() => choose(o.value)}
              disabled={pending}
              aria-pressed={active}
              className={
                active
                  ? "flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 disabled:opacity-50"
                  : "flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              }
            >
              <span className="h-3.5 w-3.5 rounded-full border border-slate-300" style={{ background: o.swatch }} />
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">
        {pending ? "切り替え中..." : `いまサイトに出ている配色: ${LABELS[effective]}${current === null ? "(自動)" : ""}`}
      </p>
      {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}

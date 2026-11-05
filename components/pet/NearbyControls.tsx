"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LocateFixed, Loader2 } from "lucide-react";

/** 迷子さがしの「どこから何kmを見るか」。現在地ボタンはURLに位置(約100m単位)を入れて読み直す(保存はしない)。 */
export function NearbyControls({ radius, radii, originLabel }: { radius: number; radii: number[]; originLabel: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function go(patch: Record<string, string | null>) {
    const q = new URLSearchParams(params.toString());
    q.delete("limit");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    router.push(`${pathname}?${q.toString()}`, { scroll: false });
  }

  function locate() {
    if (!navigator.geolocation) return setError("この端末では現在地を取れません");
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const r = radius > 0 ? radius : 10;
        go({ lat: pos.coords.latitude.toFixed(3), lng: pos.coords.longitude.toFixed(3), r: String(r) });
      },
      () => {
        setLocating(false);
        setError("現在地を取れませんでした");
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {radii.map((r) => (
          <button
            key={r}
            type="button"
            disabled={r > 0 && !originLabel}
            onClick={() => go({ r: String(r) })}
            className={`rounded-full px-3.5 py-2 text-xs font-extrabold transition disabled:opacity-40 ${radius === r ? "bg-[#FF8E5E] text-white shadow-[0_2px_0_#EE6A36]" : "bg-white text-[#9C8273]"}`}
          >
            {r === 0 ? "全国" : `${r}km以内`}
          </button>
        ))}
        <button type="button" onClick={locate} className="ml-auto flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold text-[#EE6A36] shadow-sm active:scale-95">
          {locating ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />}
          現在地から
        </button>
      </div>
      <p className="mt-1 px-1 text-[11px] text-[#9C8273]">
        {error ?? (originLabel ? (radius > 0 ? `📍 ${originLabel}から${radius}km以内` : "全国(新しい順)") : "現在地か散歩エリアを使うと、近くだけに絞れます")}
      </p>
    </div>
  );
}

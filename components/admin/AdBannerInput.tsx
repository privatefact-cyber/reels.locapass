"use client";

import { useEffect, useState } from "react";
import { AD_BANNER_SPEC_TEXT, adBannerProblem } from "@/lib/recommend/adBannerSpec";

/**
 * 広告カードの画像の入力。
 *  - 規格(サイズ・形式・容量)に合わない画像は、選んだ時点で外して理由を出す。サーバーでも同じ確認をする。
 *  - 画像の「見せたい中心」を、画像をクリックして決められる。枠に合わせて切り取られるとき(下の枠など)、その点が見えるようにする。
 *    下に、上の枠・下の枠での見え方のプレビューを出す。
 */
export function AdBannerInput({
  name,
  className,
  initialUrl,
  initialFocusX = 50,
  initialFocusY = 50,
}: {
  name: string;
  className?: string;
  initialUrl?: string | null;
  initialFocusX?: number;
  initialFocusY?: number;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl ?? null);
  const [focus, setFocus] = useState({ x: initialFocusX, y: initialFocusY });

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    setMessage(null);
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("画像を読み取れませんでした"));
        img.src = url;
      }).catch((err) => {
        URL.revokeObjectURL(url);
        throw err;
      });
      const problem = adBannerProblem({ ...size, bytes: file.size, type: file.type });
      if (problem) {
        URL.revokeObjectURL(url);
        input.value = "";
        setMessage(problem);
        return;
      }
      setPreviewUrl(url);
      setFocus({ x: 50, y: 50 });
    } catch (err) {
      input.value = "";
      setMessage(err instanceof Error ? err.message : "画像を確認できませんでした");
    }
  }

  function pick(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * 100)));
    const y = Math.min(100, Math.max(0, Math.round(((e.clientY - r.top) / r.height) * 100)));
    setFocus({ x, y });
  }

  const pos = `${focus.x}% ${focus.y}%`;

  return (
    <>
      <input type="file" name={name} accept="image/jpeg,image/png,image/webp" onChange={onChange} className={className} />
      <span className="mt-1 block text-[11px] text-slate-500">規格: {AD_BANNER_SPEC_TEXT}。これ以外の画像は登録できません。</span>
      {message && <span className="block text-[11px] font-semibold text-red-600">{message}</span>}
      <input type="hidden" name="focusX" value={focus.x} />
      <input type="hidden" name="focusY" value={focus.y} />
      {previewUrl && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-slate-600">見せたい中心を、画像をクリックして決めてください(下の枠など、切り取られる枠で、この点が見えます)。</p>
          <div className="relative w-full max-w-sm cursor-crosshair overflow-hidden rounded-lg border border-slate-300" style={{ aspectRatio: "1200 / 628" }} onClick={pick}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            <span className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-pink-500/70 shadow" style={{ left: `${focus.x}%`, top: `${focus.y}%` }} />
          </div>
          <p className="text-[11px] text-slate-500">下の枠(バナー)での見え方:</p>
          <div className="flex w-[320px] max-w-full overflow-hidden rounded-xl border border-slate-300 bg-white" style={{ height: 108 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="" className="h-full w-[42%] shrink-0 object-cover" style={{ objectPosition: pos }} />
            <div className="flex-1 p-2 text-[10px] text-slate-400">見出し・ボタン</div>
          </div>
        </div>
      )}
    </>
  );
}

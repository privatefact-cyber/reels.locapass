"use client";

import { useState } from "react";
import { AD_BANNER_SPEC_TEXT, adBannerProblem } from "@/lib/recommend/adBannerSpec";

/** 広告カードの画像の入力。規格(サイズ・形式・容量)に合わない画像は、選んだ時点で外して理由を出す。サーバーでも同じ確認をする。 */
export function AdBannerInput({ name, className }: { name: string; className?: string }) {
  const [message, setMessage] = useState<string | null>(null);

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
      }).finally(() => URL.revokeObjectURL(url));
      const problem = adBannerProblem({ ...size, bytes: file.size, type: file.type });
      if (problem) {
        input.value = "";
        setMessage(problem);
      }
    } catch (err) {
      input.value = "";
      setMessage(err instanceof Error ? err.message : "画像を確認できませんでした");
    }
  }

  return (
    <>
      <input type="file" name={name} accept="image/jpeg,image/png,image/webp" onChange={onChange} className={className} />
      <span className="mt-1 block text-[11px] text-slate-500">規格: {AD_BANNER_SPEC_TEXT}。これ以外の画像は登録できません。</span>
      {message && <span className="block text-[11px] font-semibold text-red-600">{message}</span>}
    </>
  );
}

"use client";

import { useState } from "react";
import { prepareDmImage } from "@/lib/dm/prepareDmImage";

/**
 * 画像を選ぶと、ブラウザの中で長辺1280pxのJPEGに縮めてから、フォームに入れ直す。
 * スマホの写真は数MBあり、そのまま送るとVercelのリクエスト上限(4.5MB)を超えて「通信エラー」になるため。
 */
export function ResizingImageInput({ name, required, className }: { name: string; required?: boolean; className?: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    setMessage(null);
    if (!file) return;
    try {
      const blob = await prepareDmImage(file);
      const resized = new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "thumb"}.jpg`, { type: "image/jpeg" });
      const dt = new DataTransfer();
      dt.items.add(resized);
      input.files = dt.files;
    } catch (err) {
      input.value = "";
      setMessage(err instanceof Error ? err.message : "画像を処理できませんでした");
    }
  }

  return (
    <>
      <input type="file" name={name} accept="image/*" required={required} onChange={onChange} className={className} />
      {message && <span className="block text-[11px] text-red-600">{message}</span>}
    </>
  );
}

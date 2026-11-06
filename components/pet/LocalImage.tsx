"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { getLocalImage, isLocalRef } from "./localImages";

/**
 * 端末内(IndexedDB)に保存した画像を表示する。この端末に無い(別の端末で撮った・データが消えた)ときは、その旨を出す。
 * タップで大きく開き、「端末に保存」で写真アプリやファイルに書き出せる(自分でバックアップできるように)。
 */
export function LocalImage({ refId, className = "", fileName = "pet-document.jpg", size = "thumb" }: { refId: string; className?: string; fileName?: string; size?: "thumb" | "small" }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isLocalRef(refId)) return setMissing(true);
    let created: string | null = null;
    getLocalImage(refId).then((blob) => {
      if (!blob) return setMissing(true);
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      if (created) URL.revokeObjectURL(created);
    };
  }, [refId]);

  if (missing) {
    return (
      <span className={`flex flex-col items-center justify-center bg-[#F4EEE8] text-center text-[9px] font-bold leading-tight text-[#B39C8C] ${className}`} title="この端末には画像がありません">
        <Smartphone size={size === "thumb" ? 16 : 14} />
        別の端末
      </span>
    );
  }
  if (!url) return <span className={`animate-pulse bg-[#FFF3E6] ${className}`} />;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className={`object-cover ${className}`} />
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-black/80 p-4" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="max-h-[75vh] max-w-full rounded-2xl object-contain" />
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <a href={url} download={fileName} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-extrabold text-[#4A3426]">
              <Download size={16} />
              端末に保存
            </a>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-white/20 px-4 py-2.5 text-sm font-bold text-white">
              閉じる
            </button>
          </div>
          <p className="text-center text-[11px] text-white/70">この画像はこの端末の中だけに保存されています。機種変更に備えて、写真アプリなどにも保存しておくと安心です。</p>
        </div>
      )}
    </>
  );
}

/** 書類・通院の画像の保存場所の注記 */
export function LocalImageNotice() {
  return (
    <p className="flex items-start gap-1 px-1 text-[11px] leading-relaxed text-[#B39C8C]">
      <Smartphone size={12} className="mt-0.5 shrink-0" />
      画像はお使いの端末の中だけに保存され、サーバーには送りません(ブラウザのデータ消去や機種変更で消える場合があります)。読み取った日付などの文字だけを保存します。
    </p>
  );
}

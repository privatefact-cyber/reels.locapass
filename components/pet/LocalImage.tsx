"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Lock, Smartphone } from "lucide-react";
import { migrateLocalImageRef } from "@/app/pet/actions";
import { deleteLocalImages, getLocalImage, isLocalRef } from "./localImages";
import { uploadPetImage } from "./petUpload";

/**
 * 以前「端末内だけ」(IndexedDB)に保存した画像を表示する。
 * 2026-11-07に「非公開の置き場に保存」へ方針を戻したので、この端末に画像があれば自動で置き場へ移し、記録を差し替えて端末から消す
 * (migrate を渡したとき)。この端末に無い(別の端末で撮った・データが消えた)ときは、その旨を出す。
 */
export function LocalImage({
  refId,
  className = "",
  fileName = "pet-document.jpg",
  size = "thumb",
  migrate,
}: {
  refId: string;
  className?: string;
  fileName?: string;
  size?: "thumb" | "small";
  migrate?: { kind: "document" | "medical"; petId: string; recordId: string };
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isLocalRef(refId)) return setMissing(true);
    let created: string | null = null;
    getLocalImage(refId).then(async (blob) => {
      if (!blob) return setMissing(true);
      created = URL.createObjectURL(blob);
      setUrl(created);
      if (!migrate) return;
      try {
        const newPath = await uploadPetImage(migrate.kind, migrate.petId, new File([blob], "image.jpg", { type: blob.type || "image/jpeg" }));
        const res = await migrateLocalImageRef({ kind: migrate.kind, recordId: migrate.recordId, oldRef: refId, newPath });
        if (res.ok) {
          await deleteLocalImages([refId]);
          router.refresh();
        }
      } catch {
        // 移せなかったら、次に開いたときにまた試す
      }
    });
    return () => {
      if (created) URL.revokeObjectURL(created);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <Lock size={12} className="mt-0.5 shrink-0" />
      画像は非公開の場所に保存され、あなただけが見られます(表示用のリンクは10分で無効になります)。機種変更しても、同じアカウントでログインすれば見られます。
    </p>
  );
}

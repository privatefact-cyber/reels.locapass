"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { setPetImage } from "@/app/pet/actions";
import { uploadPetImage } from "./petUpload";
import { PetAvatar } from "./ui";

/**
 * 犬のページの上の部分。背景(カバー写真)とアイコンを、それぞれ写真に入れ替えられる。
 * 背景が未設定のときは、パステルのグラデーション+肉球。
 */
export function PetHero({
  petId,
  name,
  avatarUrl,
  coverUrl,
  editable,
  children,
}: {
  petId: string;
  name: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  editable: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const coverInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"cover" | "avatar" | null>(null);
  const [preview, setPreview] = useState<{ cover?: string; avatar?: string }>({});
  const [error, setError] = useState<string | null>(null);

  async function change(slot: "cover" | "avatar", file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(slot);
    setPreview((p) => ({ ...p, [slot]: URL.createObjectURL(file) }));
    try {
      const path = await uploadPetImage(slot, petId, file);
      const res = await setPetImage(petId, slot, path);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "変更できませんでした");
      setPreview((p) => ({ ...p, [slot]: undefined }));
    } finally {
      setBusy(null);
    }
  }

  const cover = preview.cover ?? coverUrl;
  const avatar = preview.avatar ?? avatarUrl;

  return (
    <div className="relative -mx-4">
      <div
        className="relative h-48 overflow-hidden rounded-b-[36px] bg-gradient-to-br from-[#FFD3B8] via-[#FFE7C2] to-[#CDEFE3]"
        style={cover ? { backgroundImage: `url(${cover})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {!cover && (
          <span className="absolute inset-0 flex items-center justify-center text-6xl opacity-30" aria-hidden>
            🐾 🦴 🐾
          </span>
        )}
        {cover && <span className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />}
        {editable && (
          <button
            type="button"
            onClick={() => coverInput.current?.click()}
            className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-[#7A6050] shadow active:scale-95"
          >
            {busy === "cover" ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            背景をかえる
          </button>
        )}
      </div>

      <div className="relative -mt-14 flex flex-col items-center px-4">
        <div className="relative">
          <PetAvatar url={avatar} name={name} size={112} />
          {editable && (
            <button
              type="button"
              aria-label="アイコンをかえる"
              onClick={() => avatarInput.current?.click()}
              className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#FF8E5E] text-white shadow-[0_3px_0_#EE6A36] active:scale-95"
            >
              {busy === "avatar" ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            </button>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-extrabold text-[#4A3426]">{name}</h1>
        {children}
        {error && <p className="mt-2 text-sm font-bold text-[#D04848]">{error}</p>}
      </div>

      <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={(e) => change("cover", e.target.files?.[0])} />
      <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(e) => change("avatar", e.target.files?.[0])} />
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus, X } from "lucide-react";
import { savePetDiary } from "@/app/pet/actions";
import { todayJst } from "@/lib/pet/calc";
import { VISIBILITY_LABEL, type PetVisibility } from "@/lib/pet/types";
import { uploadPetImage } from "./petUpload";
import { PetCard, PetField, petButton, petInput } from "./ui";

/** 成長日誌(写真・体重・ひとこと)を追加する */
export function DiaryForm({ petId }: { petId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(todayJst());
  const [weight, setWeight] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<PetVisibility>("private");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const imagePaths: string[] = [];
      for (const file of files) imagePaths.push(await uploadPetImage("diary", petId, file));
      const res = await savePetDiary({ petId, entryDate, weightKg: weight, body, imagePaths, visibility });
      if (!res.ok) throw new Error(res.error);
      setOpen(false);
      setFiles([]);
      setWeight("");
      setBody("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${petButton.primary} w-full`}>
        <Plus size={18} />
        きょうの日誌を書く
      </button>
    );

  return (
    <PetCard className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-extrabold text-[#4FBF9F]">📔 成長日誌</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="rounded-full p-1 text-[#B39C8C]">
          <X size={20} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {files.map((file, i) => (
          <span key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(file)} alt="" className="h-20 w-20 rounded-2xl object-cover" />
            <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 shadow" aria-label="外す">
              <X size={12} />
            </button>
          </span>
        ))}
        {files.length < 4 && (
          <button type="button" onClick={() => fileInput.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#F1E1CF] text-xs font-bold text-[#B39C8C]">
            <Camera size={20} />
            写真
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PetField label="日付">
          <input type="date" className={petInput} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </PetField>
        <PetField label="体重(kg)">
          <input className={petInput} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder="例: 3.4" />
        </PetField>
      </div>
      <PetField label="ひとこと">
        <textarea className={`${petInput} min-h-[72px]`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="例: はじめてドッグランデビュー!" maxLength={1000} />
      </PetField>
      <div>
        <span className="mb-1 block px-1 text-[13px] font-bold text-[#7A6050]">見られる人</span>
        <div className="flex gap-2">
          {(Object.keys(VISIBILITY_LABEL) as PetVisibility[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold ${visibility === v ? "border-[#FF8E5E] bg-[#FFEBDD] text-[#C2562A]" : "border-[#F1E1CF] text-[#9C8273]"}`}
            >
              {VISIBILITY_LABEL[v]}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm font-bold text-[#D04848]">{error}</p>}
      <button type="button" onClick={save} disabled={busy} className={`${petButton.primary} w-full`}>
        {busy && <Loader2 size={18} className="animate-spin" />}
        保存する
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          setFiles((p) => [...p, ...picked].slice(0, 4));
          e.target.value = "";
        }}
      />
    </PetCard>
  );
}

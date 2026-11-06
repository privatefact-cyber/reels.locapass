"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus, X } from "lucide-react";
import { savePetMedical } from "@/app/pet/actions";
import { todayJst } from "@/lib/pet/calc";
import { uploadPetImage } from "./petUpload";
import { LocalImageNotice } from "./LocalImage";
import { PetCard, PetField, petButton, petInput } from "./ui";

/** 病気・通院の記録を追加する(明細・処方の写真は最大6枚) */
export function MedicalForm({ petId, defaultHospital }: { petId: string; defaultHospital?: string | null }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ visitedOn: todayJst(), hospital: defaultHospital ?? "", symptoms: "", diagnosis: "", medicines: "", cost: "", note: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const imagePaths: string[] = [];
      // 非公開の置き場に保存(本人だけが、10分で切れるリンクで見られる)
      for (const file of files) imagePaths.push(await uploadPetImage("medical", petId, file));
      const res = await savePetMedical({ petId, ...f, imagePaths });
      if (!res.ok) throw new Error(res.error);
      setOpen(false);
      setFiles([]);
      setF({ visitedOn: todayJst(), hospital: defaultHospital ?? "", symptoms: "", diagnosis: "", medicines: "", cost: "", note: "" });
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
        通院・体調を記録する
      </button>
    );

  return (
    <PetCard className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-extrabold text-[#6AADEB]">🩺 通院・体調の記録</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="rounded-full p-1 text-[#B39C8C]">
          <X size={20} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PetField label="日付 *">
          <input type="date" className={petInput} value={f.visitedOn} onChange={(e) => set("visitedOn", e.target.value)} />
        </PetField>
        <PetField label="金額(円)">
          <input className={petInput} inputMode="numeric" value={f.cost} onChange={(e) => set("cost", e.target.value.replace(/[^\d]/g, ""))} />
        </PetField>
      </div>
      <PetField label="病院">
        <input className={petInput} value={f.hospital} onChange={(e) => set("hospital", e.target.value)} />
      </PetField>
      <PetField label="症状・ようす">
        <textarea className={`${petInput} min-h-[72px]`} value={f.symptoms} onChange={(e) => set("symptoms", e.target.value)} placeholder="例: 朝から2回吐いた、元気はある" />
      </PetField>
      <PetField label="診断">
        <input className={petInput} value={f.diagnosis} onChange={(e) => set("diagnosis", e.target.value)} />
      </PetField>
      <PetField label="お薬">
        <input className={petInput} value={f.medicines} onChange={(e) => set("medicines", e.target.value)} placeholder="例: 整腸剤 1日2回 5日分" />
      </PetField>
      <PetField label="メモ">
        <input className={petInput} value={f.note} onChange={(e) => set("note", e.target.value)} />
      </PetField>
      <div className="flex flex-wrap gap-2">
        {files.map((file, i) => (
          <span key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(file)} alt="" className="h-16 w-16 rounded-xl object-cover" />
            <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 shadow" aria-label="外す">
              <X size={12} />
            </button>
          </span>
        ))}
        {files.length < 6 && (
          <button type="button" onClick={() => fileInput.current?.click()} className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#F1E1CF] text-[10px] font-bold text-[#B39C8C]">
            <Camera size={18} />
            明細・薬
          </button>
        )}
      </div>
      {error && <p className="text-sm font-bold text-[#D04848]">{error}</p>}
      <button type="button" onClick={save} disabled={busy} className={`${petButton.primary} w-full`}>
        {busy && <Loader2 size={18} className="animate-spin" />}
        保存する
      </button>
      <LocalImageNotice />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          setFiles((p) => [...p, ...picked].slice(0, 6));
          e.target.value = "";
        }}
      />
    </PetCard>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Megaphone } from "lucide-react";
import { startLostReport, updateLostReport, type LostReportInput } from "@/app/pet/actions";
import { reverseGeocode } from "@/lib/map/geocode";
import { uploadPetImage } from "./petUpload";
import { PetMap } from "./PetMap";
import { PetCard, PetField, petButton, petInput } from "./ui";

type Existing = {
  id: string;
  lastSeenAt: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  features: string | null;
  contactPhone: string | null;
  contactLine: string | null;
  contactNote: string | null;
};

function toLocalInput(iso: string | null) {
  const d = iso ? new Date(iso) : new Date();
  const jst = new Date(d.getTime() + 9 * 3600_000);
  return jst.toISOString().slice(0, 16);
}

/** 迷子のお知らせを出す/直す。公開する連絡先は飼い主が選んで入れる。 */
export function LostReportForm({ petId, petName, defaultFeatures, existing }: { petId: string; petName: string; defaultFeatures: string; existing?: Existing }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [seenAt, setSeenAt] = useState(toLocalInput(existing?.lastSeenAt ?? null));
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(existing?.lat != null && existing.lng != null ? { lat: existing.lat, lng: existing.lng } : null);
  const [address, setAddress] = useState(existing?.address ?? "");
  const [features, setFeatures] = useState(existing?.features ?? defaultFeatures);
  const [phone, setPhone] = useState(existing?.contactPhone ?? "");
  const [line, setLine] = useState(existing?.contactLine ?? "");
  const [note, setNote] = useState(existing?.contactNote ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function pickPoint(v: { lat: number; lng: number }) {
    setPoint(v);
    const a = await reverseGeocode(v.lat, v.lng);
    if (a) setAddress(a);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const photoPath = file ? await uploadPetImage("lost", petId, file) : undefined;
      // datetime-local は日本時間として扱う
      const lastSeenAt = new Date(`${seenAt}:00+09:00`).toISOString();
      const input: LostReportInput = { petId, lastSeenAt, lat: point?.lat ?? null, lng: point?.lng ?? null, address, features, contactPhone: phone, contactLine: line, contactNote: note, ...(photoPath ? { photoPath } : {}) };
      if (existing) {
        const res = await updateLostReport(existing.id, input);
        if (!res.ok) throw new Error(res.error);
        setDone("保存しました");
      } else {
        if (!confirm(`${petName}ちゃんの迷子のお知らせを出します。近くの人とフォロワーに通知が届き、名刺ページに連絡先が表示されます。よろしいですか?`)) return;
        const res = await startLostReport(input);
        if (!res.ok) throw new Error(res.error);
        setDone(`お知らせを出しました(${res.alerted}人に通知)`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "うまくいきませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PetCard className="space-y-3">
        <h3 className="text-sm font-extrabold text-[#D04848]">📍 最後に見た場所と時間</h3>
        <PetField label="日時">
          <input type="datetime-local" className={petInput} value={seenAt} onChange={(e) => setSeenAt(e.target.value)} />
        </PetField>
        <PetMap picker={{ value: point, onChange: pickPoint }} height={220} />
        <PetField label="場所の説明">
          <input className={petInput} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="例: 渋谷区神南 代々木公園の入口付近" />
        </PetField>
      </PetCard>

      <PetCard className="space-y-3">
        <h3 className="text-sm font-extrabold text-[#EE6A36]">🐶 見た目の特徴</h3>
        <textarea className={`${petInput} min-h-[90px]`} value={features} onChange={(e) => setFeatures(e.target.value)} placeholder="例: 茶色のトイプードル、赤い首輪、人なつこい" />
        <button type="button" onClick={() => fileInput.current?.click()} className={`${petButton.soft} w-full`}>
          <Camera size={16} />
          {file ? `写真: ${file.name}` : "最近の写真を付ける(なければアイコンを使います)"}
        </button>
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </PetCard>

      <PetCard className="space-y-3">
        <h3 className="text-sm font-extrabold text-[#4FBF9F]">📞 見つけた人からの連絡先(公開されます)</h3>
        <p className="text-xs text-[#9C8273]">迷子のお知らせ中だけ、名刺ページ(首輪のQR)と迷子マップに表示されます。見つかってお知らせを終えると消えます。1つ以上入れてください。</p>
        <PetField label="電話番号">
          <input className={petInput} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="090-0000-0000" />
        </PetField>
        <PetField label="LINE ID">
          <input className={petInput} value={line} onChange={(e) => setLine(e.target.value)} />
        </PetField>
        <PetField label="ひとこと(謝礼・お願いなど)">
          <input className={petInput} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 見かけたらご連絡ください。保護してくださった方には謝礼をお渡しします" />
        </PetField>
      </PetCard>

      {error && <p className="rounded-2xl bg-[#FFE4E4] px-4 py-3 text-sm font-bold text-[#D04848]">{error}</p>}
      {done && <p className="rounded-2xl bg-[#DDF5EC] px-4 py-3 text-sm font-bold text-[#2E9C7C]">{done}</p>}
      <button type="button" onClick={submit} disabled={busy} className={existing ? `${petButton.primary} w-full` : "inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#D04848] px-5 py-3.5 text-[15px] font-extrabold text-white shadow-[0_4px_0_#A83333] active:translate-y-[2px] disabled:opacity-50"}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Megaphone size={18} />}
        {existing ? "内容を保存" : "迷子のお知らせを出す"}
      </button>
    </div>
  );
}

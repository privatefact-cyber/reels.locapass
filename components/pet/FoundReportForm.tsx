"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Send } from "lucide-react";
import exifr from "exifr";
import { postFoundReport } from "@/app/pet/actions";
import { reverseGeocode } from "@/lib/map/geocode";
import { uploadPetImage } from "./petUpload";
import { PetMap } from "./PetMap";
import { PetCard, PetField, petButton, petInput } from "./ui";

function nowLocal() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16);
}

/** 「迷子のペットを見つけました!」の通報フォーム */
export function FoundReportForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"protected" | "sighted">("sighted");
  const [species, setSpecies] = useState<"dog" | "cat" | "other">("dog");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [foundAt, setFoundAt] = useState(nowLocal());
  const [features, setFeatures] = useState("");
  const [handedTo, setHandedTo] = useState("");
  const [contactNote, setContactNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickPoint(v: { lat: number; lng: number }) {
    setPoint(v);
    const a = await reverseGeocode(v.lat, v.lng);
    if (a) setAddress(a);
  }

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    try {
      const gps = await exifr.gps(f);
      if (gps?.latitude && gps?.longitude) await pickPoint({ lat: gps.latitude, lng: gps.longitude });
    } catch {
      // 位置情報のない写真はそのまま
    }
  }

  async function submit() {
    if (!point) return setError("見つけた場所を地図で選んでください");
    setBusy(true);
    setError(null);
    try {
      const photoPath = file ? await uploadPetImage("found", "new", file) : null;
      const res = await postFoundReport({
        kind,
        species,
        lat: point.lat,
        lng: point.lng,
        address,
        foundAt: new Date(`${foundAt}:00+09:00`).toISOString(),
        features,
        handedTo,
        contactNote,
        photoPath,
      });
      if (!res.ok) throw new Error(res.error);
      router.push(`/pet/found/${res.id}?posted=${res.notified}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通報できませんでした");
      setBusy(false);
    }
  }

  const chip = (on: boolean) => `rounded-full border-2 px-4 py-2 text-sm font-bold transition ${on ? "border-[#2E9C7C] bg-[#E5F7F0] text-[#22806A]" : "border-[#F1E1CF] bg-white text-[#9C8273]"}`;

  return (
    <div className="space-y-4">
      <PetCard className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setKind("sighted")} className={`rounded-3xl border-2 p-3 text-left ${kind === "sighted" ? "border-[#E0A800] bg-[#FFF6D6]" : "border-[#F1E1CF]"}`}>
            <p className="text-2xl">👀</p>
            <p className="text-sm font-extrabold">見かけました</p>
            <p className="text-[11px] text-[#9C8273]">ひとりで歩いていた など</p>
          </button>
          <button type="button" onClick={() => setKind("protected")} className={`rounded-3xl border-2 p-3 text-left ${kind === "protected" ? "border-[#2E9C7C] bg-[#E5F7F0]" : "border-[#F1E1CF]"}`}>
            <p className="text-2xl">🤲</p>
            <p className="text-sm font-extrabold">保護しています</p>
            <p className="text-[11px] text-[#9C8273]">いま一緒にいる・預けた</p>
          </button>
        </div>
        <div className="flex gap-2">
          {(
            [
              ["dog", "🐶 犬"],
              ["cat", "🐱 猫"],
              ["other", "🐾 その他"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setSpecies(v)} className={chip(species === v)}>
              {l}
            </button>
          ))}
        </div>
      </PetCard>

      <PetCard className="space-y-3">
        <h3 className="text-sm font-extrabold text-[#2E9C7C]">📷 写真</h3>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="max-h-64 w-full rounded-2xl object-cover" />
        ) : null}
        <button type="button" onClick={() => fileInput.current?.click()} className={`${petButton.soft} w-full`}>
          <Camera size={16} />
          {file ? "写真を撮り直す" : "写真を撮る・選ぶ"}
        </button>
        <p className="text-xs text-[#B39C8C]">写真に位置情報があれば、場所を自動で入れます。</p>
        <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
      </PetCard>

      <PetCard className="space-y-3">
        <h3 className="text-sm font-extrabold text-[#D04848]">📍 見つけた場所と時間</h3>
        <PetMap picker={{ value: point, onChange: pickPoint }} height={220} />
        <PetField label="場所の説明">
          <input className={petInput} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="例: 渋谷区神南 公園の入口" />
        </PetField>
        <PetField label="日時">
          <input type="datetime-local" className={petInput} value={foundAt} onChange={(e) => setFoundAt(e.target.value)} />
        </PetField>
      </PetCard>

      <PetCard className="space-y-3">
        <h3 className="text-sm font-extrabold text-[#EE6A36]">🐾 ようす</h3>
        <PetField label="見た目の特徴">
          <textarea className={`${petInput} min-h-[80px]`} value={features} onChange={(e) => setFeatures(e.target.value)} placeholder="例: 茶色の小型犬、青い首輪、人なつこい" maxLength={500} />
        </PetField>
        {kind === "protected" && (
          <PetField label="保護している場所・預け先" hint="警察・動物愛護センター・動物病院などに預けた場合は、その名前を">
            <input className={petInput} value={handedTo} onChange={(e) => setHandedTo(e.target.value)} placeholder="例: 渋谷警察署に届けました" />
          </PetField>
        )}
        <PetField label="飼い主さんへの連絡方法(公開されます・任意)" hint="入れなくても、飼い主さんが「うちの子かも」を押すと通知で届きます">
          <input className={petInput} value={contactNote} onChange={(e) => setContactNote(e.target.value)} placeholder="例: 渋谷駅前の〇〇カフェで預かっています" />
        </PetField>
      </PetCard>

      {error && <p className="rounded-2xl bg-[#FFE4E4] px-4 py-3 text-sm font-bold text-[#D04848]">{error}</p>}
      <button type="button" onClick={submit} disabled={busy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#2E9C7C] px-5 py-3.5 text-[15px] font-extrabold text-white shadow-[0_4px_0_#22806A] active:translate-y-[2px] disabled:opacity-50">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        通報してみんなに知らせる
      </button>
      <p className="px-2 text-center text-[11px] text-[#B39C8C]">近くで迷子のお知らせを出している飼い主さんと、近くの利用者に通知が届きます。</p>
    </div>
  );
}

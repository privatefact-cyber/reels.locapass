"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Send } from "lucide-react";
import exifr from "exifr";
import { postSighting } from "@/app/pet/actions";
import { reverseGeocode } from "@/lib/map/geocode";
import { uploadPetImage } from "./petUpload";
import { PetMap } from "./PetMap";
import { PetCard, PetField, petButton, petInput } from "./ui";

/** 「ここで見た!」の投稿。写真に位置情報があれば、その場所を自動で選ぶ(みんなのフォトと同じ仕組み)。 */
export function SightingForm({ reportId, petName, loggedIn, center }: { reportId: string; petName: string; loggedIn: boolean; center: { lat: number; lng: number } | null }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!loggedIn) {
    return (
      <PetCard className="text-center">
        <p className="text-sm font-bold">目撃情報を送るにはログインが必要です</p>
        <p className="mt-1 text-xs text-[#9C8273]">いたずら防止のため、LOCAPASSの会員(無料)の方だけが送れます</p>
        <Link href={`/mypage/login?redirect=${encodeURIComponent(`/pet/lost?report=${reportId}`)}`} className={`${petButton.primary} mt-3 w-full`}>
          ログイン / 無料で会員登録
        </Link>
      </PetCard>
    );
  }

  if (done) {
    return (
      <PetCard className="text-center">
        <p className="text-4xl">🙏</p>
        <p className="mt-2 font-extrabold">ありがとうございます!</p>
        <p className="mt-1 text-sm text-[#7A6050]">飼い主さんに目撃情報を届けました。</p>
      </PetCard>
    );
  }

  async function pickPoint(v: { lat: number; lng: number }) {
    setPoint(v);
    const a = await reverseGeocode(v.lat, v.lng);
    if (a) setAddress(a);
  }

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setFile(f);
    try {
      const gps = await exifr.gps(f);
      if (gps?.latitude && gps?.longitude) await pickPoint({ lat: gps.latitude, lng: gps.longitude });
    } catch {
      // 位置情報のない写真はそのまま
    }
  }

  async function submit() {
    if (!point) return setError("見かけた場所を地図で選んでください");
    setBusy(true);
    setError(null);
    try {
      const photoPath = file ? await uploadPetImage("sighting", reportId, file) : null;
      const res = await postSighting({ lostReportId: reportId, lat: point.lat, lng: point.lng, address, comment, photoPath });
      if (!res.ok) throw new Error(res.error);
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "送れませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PetCard className="space-y-3">
      <h3 className="text-sm font-extrabold text-[#9A6B00]">👀 {petName}ちゃんを見かけた場所</h3>
      <PetMap picker={{ value: point, onChange: pickPoint }} center={center} height={220} />
      <PetField label="場所の説明">
        <input className={petInput} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="例: 渋谷駅ハチ公口のあたり" />
      </PetField>
      <PetField label="ようす">
        <input className={petInput} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="例: 駅の方へ走っていった" />
      </PetField>
      <button type="button" onClick={() => fileInput.current?.click()} className={`${petButton.soft} w-full`}>
        <Camera size={16} />
        {file ? "写真を選びました" : "写真を付ける(あれば)"}
      </button>
      <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
      {error && <p className="text-sm font-bold text-[#D04848]">{error}</p>}
      <button type="button" onClick={submit} disabled={busy} className={`${petButton.primary} w-full`}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        飼い主さんに届ける
      </button>
    </PetCard>
  );
}

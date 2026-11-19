"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, Loader2, MapPin, X } from "lucide-react";
import { postPetOuting, type PetSnapPlace } from "@/app/pet/actions";
import type { PetSpot } from "@/lib/pet/spots";
import type { OutingPresetPlace } from "@/lib/pet/outingPlace";
import { reverseGeocode } from "@/lib/map/geocode";
import { uploadPetImage } from "./petUpload";
import { useAiConsent } from "./AiConsent";
import { PetMap } from "./PetMap";
import { PetCard, PetField, petButton, petInput } from "./ui";

type Point = { lat: number; lng: number };
type Picked = { kind: "shop" | "place"; id: string; name: string };

/** 散歩エリアからこの距離より近い場所は「自宅の近くかも」と警告する */
const HOME_WARN_M = 300;

function distanceM(a: Point, b: Point) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function PhotoPreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={file.name} className="h-28 w-28 rounded-2xl object-cover" /> : null;
}

/** 共有ボタンを押したとき、ぼわんと出す確認。位置が地図に公開されることを、押す前に必ず見てもらう。 */
function LocationNotice({ place, address, onConfirm, onCancel }: { place: string; address: string | null; onConfirm: () => void; onCancel: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="outing-notice-title"
      className={`fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-5 backdrop-blur-sm transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm rounded-[2rem] bg-[#FFFCF8] p-6 text-center text-[#4A3426] shadow-2xl transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] ${shown ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
      >
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFEBDD] text-3xl" aria-hidden>
          📍
        </span>
        <h2 id="outing-notice-title" className="mt-3 text-xl font-extrabold">
          位置情報が共有されます！
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#7A6050]">
          「{place}」のピンが地図に載り、<b>ロカわんを使っていない人も含めて、誰でも見られます</b>。
        </p>
        {address && <p className="mt-1 text-xs text-[#9C8273]">📍 {address}</p>}
        <p className="mt-3 rounded-2xl bg-[#FFF1F1] px-3 py-2 text-xs font-bold leading-relaxed text-[#9B3030]">自宅や、よく行く身近な場所なら、共有しないでください。</p>
        <div className="mt-5 grid gap-2">
          <button type="button" autoFocus onClick={onConfirm} className={`${petButton.primary} w-full`}>
            この場所で共有する
          </button>
          <button type="button" onClick={onCancel} className={`${petButton.ghost} w-full`}>
            やめる
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * おでかけを共有する(LOCAPASS snap=地図への写真投稿)。成長日誌とは別で、うちの子を選ばずに投稿できる。
 * - 場所は、地図で自分で選ぶ(写真の撮影位置から自動では置かない)。施設ページから来たときは、その施設の位置。
 * - 共有ボタンを押すと、「位置情報が共有されます」の確認が出る。
 */
export function OutingForm({ walkAreas = [], presetPlace = null }: { walkAreas?: (Point & { label: string | null })[]; presetPlace?: OutingPresetPlace | null }) {
  const aiConsent = useAiConsent();
  const fileInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [point, setPoint] = useState<Point | null>(presetPlace ? { lat: presetPlace.lat, lng: presetPlace.lng } : null);
  const [picked, setPicked] = useState<Picked | null>(presetPlace ? { kind: presetPlace.kind, id: presetPlace.id, name: presetPlace.name } : null);
  const [spotName, setSpotName] = useState(presetPlace?.name ?? "");
  const [address, setAddress] = useState<string | null>(presetPlace?.address ?? null);
  const [nearby, setNearby] = useState<PetSpot[]>([]);
  const [homeOk, setHomeOk] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 場所が決まったら、住所(おおよそ)と近くの施設の候補
  useEffect(() => {
    if (!point) return;
    let alive = true;
    const d = 0.0025;
    const t = setTimeout(() => {
      if (!picked || !address) reverseGeocode(point.lat, point.lng).then((a) => alive && !picked && setAddress(a));
      fetch(`/api/pet/spots?minLat=${point.lat - d}&maxLat=${point.lat + d}&minLng=${point.lng - d * 1.25}&maxLng=${point.lng + d * 1.25}`)
        .then((r) => (r.ok ? r.json() : { spots: [] }))
        .then((j: { spots: PetSpot[] }) => {
          if (!alive) return;
          const list = (j.spots ?? [])
            .filter((s) => s.lat != null && s.lng != null && distanceM(point, { lat: s.lat!, lng: s.lng! }) <= 200)
            .sort((a, b) => Number(Boolean(b.verified)) - Number(Boolean(a.verified)) || distanceM(point, { lat: a.lat!, lng: a.lng! }) - distanceM(point, { lat: b.lat!, lng: b.lng! }))
            .slice(0, 4);
          setNearby(list);
        })
        .catch(() => alive && setNearby([]));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.lat, point?.lng]);

  const nearHome = point
    ? walkAreas
        .map((w) => ({ label: w.label, m: distanceM(point, w) }))
        .filter((w) => w.m < HOME_WARN_M)
        .sort((a, b) => a.m - b.m)[0] ?? null
    : null;

  function choosePoint(p: Point) {
    setPoint(p);
    setPicked(null);
    setAddress(null);
    setHomeOk(false);
  }
  function chooseSpot(s: PetSpot) {
    if (s.lat == null || s.lng == null) return;
    setPoint({ lat: s.lat, lng: s.lng });
    setPicked({ kind: s.verified ? "shop" : "place", id: s.id, name: s.name });
    setSpotName(s.name);
    setAddress(s.address);
    setHomeOk(false);
  }

  /** 共有ボタン: 入力を確かめて、「位置情報が共有されます」の確認を出す */
  function askConfirm() {
    setError(null);
    if (!file) return setError("写真を選んでください");
    if (!point) return setError("地図で場所を選んでください");
    if (!spotName.trim()) return setError("場所の名前を入れてください");
    if (nearHome && !homeOk) return setError("自宅の近くかもしれません。場所を変えるか、確認のチェックを入れてください");
    setConfirming(true);
  }

  async function share() {
    setConfirming(false);
    if (saving.current || !file || !point) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      // 写真は、外部のAIで内容を確かめる。送る前に同意を確かめる
      if (!(await aiConsent.ensure())) {
        setError("公開前の写真の確認(AI)に同意していないため、共有できません");
        return;
      }
      const imagePath = await uploadPetImage("outing", "outing", file);
      const place: PetSnapPlace = { lat: point.lat, lng: point.lng, spotName: spotName.trim(), address, shopId: picked?.kind === "shop" ? picked.id : null, placeId: picked?.kind === "place" ? picked.id : null };
      const res = await postPetOuting({ imagePath, comment, place });
      if (!res.ok) throw new Error(res.error === "AI_CONSENT_REQUIRED" ? "公開前の写真の確認(AI)への同意が必要です。もう一度お試しください" : res.error);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "共有できませんでした");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (done) {
    return (
      <PetCard className="mt-2 text-center">
        <CheckCircle2 className="mx-auto text-[#2E9C7C]" size={44} />
        <p className="mt-3 text-lg font-extrabold">地図に載りました 🎉</p>
        <p className="mt-1 text-sm text-[#7A6050]">おでかけの場所を、みんなに共有しました。</p>
        <div className="mt-4 grid gap-2">
          <Link href="/pet/spots" className={`${petButton.primary} w-full`}>
            おでかけマップを見る
          </Link>
          <button type="button" onClick={() => { setDone(false); setFile(null); setComment(""); setPoint(null); setPicked(null); setSpotName(""); setAddress(null); setHomeOk(false); }} className={`${petButton.ghost} w-full`}>
            もう1か所共有する
          </button>
        </div>
      </PetCard>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="px-1">
        <h1 className="text-xl font-extrabold">📍 おでかけを共有</h1>
        <p className="mt-1 text-xs leading-relaxed text-[#9C8273]">ドッグラン・お店・景色のいい場所を、写真つきで地図に載せます。地図は誰でも見られます。成長日誌とは別で、日誌には保存されません。</p>
      </div>

      {/* 1. 写真 */}
      <div>
        <button type="button" onClick={() => fileInput.current?.click()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E8B899] bg-[#FFF0E5] px-4 py-4 text-base font-bold text-[#A44D2A]">
          <Camera size={24} />
          {file ? "写真を選び直す" : "写真を選ぶ"}
        </button>
        {file && (
          <div className="relative mt-3 inline-block pr-2 pt-2">
            <PhotoPreview file={file} />
            <button type="button" onClick={() => setFile(null)} className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#7A6050] shadow" aria-label="写真を外す">
              <X size={18} />
            </button>
          </div>
        )}
        <p className="mt-2 text-xs text-[#9C8273]">写真の撮影位置などの情報は、送る前に消えます。</p>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </div>

      {/* 2. 場所(地図で自分で選ぶ) */}
      <PetCard className="space-y-2">
        <p className="flex items-center gap-1 text-sm font-extrabold">
          <MapPin size={16} className="text-[#EE6A36]" />
          場所
        </p>
        <p className="px-1 text-[11px] text-[#7A6050]">{point ? "ピンの場所で共有します。地図をタップすると動かせます。" : "地図をタップするか「現在地」で、場所を選んでください。"}</p>
        <PetMap picker={{ value: point, onChange: choosePoint }} center={point} height={240} />
        {nearby.length > 0 && (
          <div>
            <p className="mb-1 px-1 text-[11px] font-bold text-[#9C8273]">ここで撮った?</p>
            <div className="flex flex-wrap gap-1.5">
              {nearby.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => chooseSpot(s)}
                  className={`rounded-full border-2 px-3 py-1 text-xs font-bold ${picked?.id === s.id ? "border-[#FF8E5E] bg-[#FFEBDD] text-[#C2562A]" : s.verified ? "border-[#FCD34D] bg-[#FFFBEB] text-[#92650A]" : "border-[#F1E1CF] bg-white text-[#7A6050]"}`}
                >
                  {s.verified ? "✓ " : ""}
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <PetField label="場所の名前">
          <input className={petInput} value={spotName} onChange={(e) => (setSpotName(e.target.value), picked && e.target.value !== picked.name && setPicked(null))} placeholder="例: 代々木公園の芝生広場" maxLength={100} />
        </PetField>
        {address && <p className="px-1 text-[11px] text-[#9C8273]">📍 {picked ? address : `${address}付近`}</p>}
        {nearHome && (
          <div className="rounded-2xl border-2 border-[#F5B5B5] bg-[#FFF1F1] p-3 text-xs text-[#9B3030]">
            <p className="flex items-center gap-1 font-extrabold">
              <AlertTriangle size={14} />
              自宅の近くかもしれません
            </p>
            <p className="mt-1 leading-relaxed">
              登録している散歩エリア{nearHome.label ? `「${nearHome.label}」` : ""}から約{Math.round(nearHome.m / 10) * 10}mの場所です。地図は誰でも見られるので、おうちの場所が分かってしまうことがあります。
            </p>
            <label className="mt-2 flex items-center gap-2 font-bold">
              <input type="checkbox" className="h-4 w-4 accent-[#D04848]" checked={homeOk} onChange={(e) => setHomeOk(e.target.checked)} />
              自宅ではないので、この場所で共有する
            </label>
          </div>
        )}
        {walkAreas.length === 0 && (
          <p className="rounded-2xl bg-[#FFF8E6] px-3 py-2 text-[11px] leading-relaxed text-[#7A5A10]">
            自宅の近くを「散歩エリア」に登録しておくと、自宅の近くを選んだときに警告します。{" "}
            <Link href="/pet/settings" className="font-bold underline">
              登録する
            </Link>
          </p>
        )}
      </PetCard>

      {/* 3. ひとこと */}
      <PetField label="ひとこと(任意)">
        <textarea className={`${petInput} min-h-[88px]`} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="例: 芝生が広くて、のびのび走れました" maxLength={300} />
      </PetField>

      {error && <p role="alert" className="rounded-2xl bg-[#FFE4E4] px-4 py-3 text-sm font-bold text-[#D04848]">{error}</p>}
      <button type="button" onClick={askConfirm} disabled={busy} className={`${petButton.primary} w-full`}>
        {busy && <Loader2 size={18} className="animate-spin" />}
        {busy ? "写真を確認して共有中…" : "地図に共有する"}
      </button>

      {confirming && <LocationNotice place={spotName.trim()} address={address} onConfirm={share} onCancel={() => setConfirming(false)} />}
    </div>
  );
}

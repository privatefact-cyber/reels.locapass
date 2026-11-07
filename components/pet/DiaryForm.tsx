"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, Loader2, MapPin, Plus, X } from "lucide-react";
import { savePetDiary, type PetSnapPlace } from "@/app/pet/actions";
import { todayJst } from "@/lib/pet/calc";
import { VISIBILITY_LABEL, type PetVisibility } from "@/lib/pet/types";
import type { PetSpot } from "@/lib/pet/spots";
import { reverseGeocode } from "@/lib/map/geocode";
import { uploadPetImage } from "./petUpload";
import { PetMap } from "./PetMap";
import { PetCard, PetField, petButton, petInput } from "./ui";

type Point = { lat: number; lng: number };
export type DiaryPresetPlace = { kind: "shop" | "place"; id: string; name: string; lat: number; lng: number; address: string | null };
type Picked = { kind: "shop" | "place"; id: string; name: string };

/** 散歩エリアからこの距離より近い場所は「自宅の近くかも」と警告する */
const HOME_WARN_M = 300;

function distanceM(a: Point, b: Point) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * 成長日誌(写真・体重・ひとこと)を追加する。
 * - 見られる人を「公開」にすると、うちの子自慢ギャラリーに並ぶ(位置は持たない)
 * - さらに「場所を付けてsnapにも投稿」をオンにすると、選んだ場所で LOCAPASS snap にも出る(最初はオフ)
 */
export function DiaryForm({
  petId,
  walkAreas = [],
  presetPlace = null,
  autoOpen = false,
}: {
  petId: string;
  walkAreas?: (Point & { label: string | null })[];
  presetPlace?: DiaryPresetPlace | null;
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(autoOpen || Boolean(presetPlace));
  const [entryDate, setEntryDate] = useState(todayJst());
  const [weight, setWeight] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<PetVisibility>(presetPlace ? "public" : "private");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // snapにも投稿
  const [snapOn, setSnapOn] = useState(Boolean(presetPlace));
  const [point, setPoint] = useState<Point | null>(presetPlace ? { lat: presetPlace.lat, lng: presetPlace.lng } : null);
  const [photoGps, setPhotoGps] = useState<Point | null>(null);
  const [picked, setPicked] = useState<Picked | null>(presetPlace ? { kind: presetPlace.kind, id: presetPlace.id, name: presetPlace.name } : null);
  const [spotName, setSpotName] = useState(presetPlace?.name ?? "");
  const [address, setAddress] = useState<string | null>(presetPlace?.address ?? null);
  const [nearby, setNearby] = useState<PetSpot[]>([]);
  const [homeOk, setHomeOk] = useState(false);

  const canSnap = visibility === "public" && files.length > 0;

  // 1枚目の写真の撮影位置(Exif)。地図の最初の位置に使うだけで、保存する写真からは消える
  useEffect(() => {
    const first = files[0];
    if (!first) return setPhotoGps(null);
    let alive = true;
    import("exifr")
      .then((m) => m.gps(first))
      .then((g) => alive && setPhotoGps(g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude) ? { lat: g.latitude, lng: g.longitude } : null))
      .catch(() => alive && setPhotoGps(null));
    return () => {
      alive = false;
    };
  }, [files]);

  // snapをオンにしたとき、まだ場所が無ければ撮影位置から始める
  useEffect(() => {
    if (snapOn && !point && photoGps) setPoint(photoGps);
  }, [snapOn, point, photoGps]);

  // 場所が決まったら、住所(おおよそ)と近くの施設の候補
  useEffect(() => {
    if (!snapOn || !point) return;
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
  }, [snapOn, point?.lat, point?.lng]);

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

  async function save() {
    setError(null);
    let snap: PetSnapPlace | null = null;
    if (snapOn && canSnap) {
      if (!point) return setError("snapに出す場所を地図で選んでください");
      if (!spotName.trim()) return setError("場所の名前を入れてください");
      if (nearHome && !homeOk) return setError("自宅の近くかもしれません。場所を変えるか、確認のチェックを入れてください");
      snap = { lat: point.lat, lng: point.lng, spotName: spotName.trim(), address, shopId: picked?.kind === "shop" ? picked.id : null, placeId: picked?.kind === "place" ? picked.id : null };
    }
    setBusy(true);
    try {
      const imagePaths: string[] = [];
      for (const file of files) imagePaths.push(await uploadPetImage("diary", petId, file));
      const res = await savePetDiary({ petId, entryDate, weightKg: weight, body, imagePaths, visibility, snap });
      if (!res.ok) {
        // 「日誌は保存しました。」で始まるのはsnapだけ失敗したとき(日誌は保存済みなので閉じる)
        if (res.error.startsWith("日誌は保存しました")) {
          reset();
          setNotice(res.error);
          router.refresh();
          return;
        }
        throw new Error(res.error);
      }
      reset();
      setNotice(res.snapPostId ? "保存しました。うちの子自慢と LOCAPASS snap にも載りました 🎉" : visibility === "public" ? "保存しました。うちの子自慢ギャラリーに載りました 🎉" : "保存しました");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setOpen(false);
    setFiles([]);
    setWeight("");
    setBody("");
    setSnapOn(false);
    setPoint(null);
    setPicked(null);
    setSpotName("");
    setAddress(null);
    setHomeOk(false);
  }

  if (!open)
    return (
      <div className="space-y-2">
        {notice && <p className="rounded-2xl bg-[#E5F7F0] px-3 py-2 text-sm font-bold text-[#22806A]">{notice}</p>}
        <button type="button" onClick={() => (setOpen(true), setNotice(null))} className={`${petButton.primary} w-full`}>
          <Plus size={18} />
          きょうの日誌を書く
        </button>
      </div>
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
        {visibility === "public" && (
          <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-[#9C8273]">
            🏆 写真が「うちの子自慢ギャラリー」に並びます。場所は付きません(写真の位置情報も消して保存します)。
          </p>
        )}
      </div>

      {/* 場所を付けて LOCAPASS snap にも */}
      <div className={`rounded-[22px] border-2 p-3 ${snapOn && canSnap ? "border-[#FFC9A8] bg-[#FFF8F1]" : "border-[#F1E1CF]"} ${canSnap ? "" : "opacity-60"}`}>
        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" className="h-5 w-5 accent-[#FF8E5E]" checked={snapOn && canSnap} disabled={!canSnap} onChange={(e) => setSnapOn(e.target.checked)} />
          <span className="min-w-0 flex-1 text-sm">
            <b className="flex items-center gap-1 text-[#4A3426]">
              <MapPin size={15} className="text-[#EE6A36]" />
              場所を付けて LOCAPASS snap にも投稿
            </b>
            <span className="block text-[11px] text-[#9C8273]">{canSnap ? "ドッグラン・お店・景色のいい場所など。地図に写真が載ります" : "写真を付けて「公開」にすると選べます"}</span>
          </span>
        </label>

        {snapOn && canSnap && (
          <div className="mt-3 space-y-2">
            <p className="px-1 text-[11px] text-[#7A6050]">{point ? "ピンの場所で投稿します。地図をタップすると動かせます。" : photoGps === null ? "地図をタップするか「現在地」で場所を選んでください" : ""}</p>
            <PetMap picker={{ value: point, onChange: choosePoint }} center={point ?? photoGps} height={220} />
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
                  登録している散歩エリア{nearHome.label ? `「${nearHome.label}」` : ""}から約{Math.round(nearHome.m / 10) * 10}mの場所です。snapの地図は誰でも見られるので、おうちの場所が分かってしまうことがあります。
                </p>
                <label className="mt-2 flex items-center gap-2 font-bold">
                  <input type="checkbox" className="h-4 w-4 accent-[#D04848]" checked={homeOk} onChange={(e) => setHomeOk(e.target.checked)} />
                  自宅ではないので、この場所で投稿する
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm font-bold text-[#D04848]">{error}</p>}
      <button type="button" onClick={save} disabled={busy} className={`${petButton.primary} w-full`}>
        {busy && <Loader2 size={18} className="animate-spin" />}
        {busy && visibility === "public" ? "写真を確認中…" : "保存する"}
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

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, ChevronDown, Loader2, MapPin, Plus, X } from "lucide-react";
import { savePetDiary, type PetSnapPlace } from "@/app/pet/actions";
import { todayJst } from "@/lib/pet/calc";
import { VISIBILITY_LABEL, type PetVisibility } from "@/lib/pet/types";
import type { PetSpot } from "@/lib/pet/spots";
import { reverseGeocode } from "@/lib/map/geocode";
import { uploadPetImage } from "./petUpload";
import { useAiConsent } from "./AiConsent";
import { PetMap } from "./PetMap";
import { PetField, petButton, petInput } from "./ui";

function PhotoPreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={file.name} className="h-24 w-24 rounded-2xl object-cover" /> : null;
}


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
  const aiConsent = useAiConsent();
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(autoOpen || Boolean(presetPlace));
  const [entryDate, setEntryDate] = useState(todayJst);
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

  const hasContent = Boolean(body.trim() || files.length || weight.trim());

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

  useEffect(() => {
    if (!open) return;
    const modal = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    modal.showModal();
    document.body.style.overflow = "hidden";
    // iOSのキーボードで隠れないよう、表示領域の高さ・位置に追従する。
    const viewport = window.visualViewport;
    const resize = () => {
      modal.style.setProperty("--diary-height", `${viewport?.height ?? window.innerHeight}px`);
      modal.style.setProperty("--diary-top", `${viewport?.offsetTop ?? 0}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      modal.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  async function save() {
    if (saving.current || !hasContent) return;
    if (!entryDate) { setError("日付を入れてください"); return; }
    if (weight && (!Number.isFinite(Number(weight)) || Number(weight) < 0.1 || Number(weight) > 120)) {
      setError("体重は0.1〜120kgで入力してください"); return;
    }
    setError(null);
    let snap: PetSnapPlace | null = null;
    if (snapOn && canSnap) {
      if (!point) return setError("snapに出す場所を地図で選んでください");
      if (!spotName.trim()) return setError("場所の名前を入れてください");
      if (nearHome && !homeOk) return setError("自宅の近くかもしれません。場所を変えるか、確認のチェックを入れてください");
      snap = { lat: point.lat, lng: point.lng, spotName: spotName.trim(), address, shopId: picked?.kind === "shop" ? picked.id : null, placeId: picked?.kind === "place" ? picked.id : null };
    }
    saving.current = true;
    setBusy(true);
    try {
      // 公開する写真は、外部のAIで内容を確かめる。送る前に同意を確かめる(同意しないときは「自分だけ」「フォロワー」で保存できる)。
      // 既存の同意画面がモーダルの下に隠れないよう、同意が要るときだけ日誌のモーダルをいったん閉じ、済んだら本文を保ったまま戻す。
      if (visibility === "public" && files.length > 0) {
        const modal = dialog.current;
        if (!aiConsent.granted) modal?.close();
        let granted: boolean;
        try {
          granted = await aiConsent.ensure();
        } finally {
          if (modal?.isConnected && !modal.open) modal.showModal();
        }
        if (!granted) {
          setError("公開前の写真の確認(AI)に同意していないため、公開できません。「自分だけ」「フォロワー」なら、このまま保存できます");
          return;
        }
      }
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
        throw new Error(res.error === "AI_CONSENT_REQUIRED" ? "公開前の写真の確認(AI)への同意が必要です。もう一度、公開で保存してください" : res.error);
      }
      reset();
      setNotice(res.snapPostId ? "保存しました。うちの子自慢と LOCAPASS snap にも載りました 🎉" : visibility === "public" ? "保存しました。うちの子自慢ギャラリーに載りました 🎉" : "保存しました");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function reset() {
    setOpen(false);
    setEntryDate(todayJst());
    setFiles([]);
    setWeight("");
    setBody("");
    setVisibility("private");
    setSnapOn(false);
    setPoint(null);
    setPicked(null);
    setSpotName("");
    setAddress(null);
    setHomeOk(false);
  }

    return (
    <>
      <button type="button" onClick={() => { setNotice(null); setOpen(true); }} className={`${petButton.primary} w-full`}>
        <Plus size={18} />{hasContent ? "書きかけの日誌をひらく" : "きょうの日誌を書く"}
      </button>
      {notice && <p role="status" className="mt-2 rounded-2xl bg-[#E5F7F0] px-3 py-2 text-center text-sm font-bold text-[#22806A]">{notice}</p>}
      <dialog
        ref={dialog}
        aria-labelledby="diary-title"
        aria-describedby="diary-hint"
        aria-busy={busy}
        onCancel={(event) => { event.preventDefault(); if (!saving.current) setOpen(false); }}
        className="fixed inset-x-0 bottom-auto top-[var(--diary-top,0px)] m-0 h-[var(--diary-height,100dvh)] max-h-none w-full max-w-none overflow-hidden border-0 bg-[#FFFCF8] p-0 text-[#4A3426] backdrop:bg-black/40 sm:mx-auto sm:mt-6 sm:h-[min(800px,calc(var(--diary-height,100dvh)-48px))] sm:max-w-xl sm:rounded-[28px] sm:shadow-2xl"
      >
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#F1E1CF] bg-white px-4 py-3">
            <button type="button" autoFocus onClick={() => setOpen(false)} disabled={busy} aria-label="閉じて入力を保持" className="flex h-11 w-11 items-center justify-center rounded-full text-[#9C8273] disabled:opacity-50">
              <X size={22} />
            </button>
            <h2 id="diary-title" className="text-base font-extrabold">日誌を書く</h2>
            <button type="button" onClick={save} disabled={busy || !hasContent} className={`${petButton.primary} min-h-11 px-4 text-sm`}>
              {busy && <Loader2 size={16} className="animate-spin" />}{busy ? (visibility === "public" && files.length > 0 ? "確認中…" : "投稿中…") : "投稿する"}
            </button>
          </header>
          {error && <p role="alert" className="shrink-0 bg-[#FFE4E4] px-5 py-3 text-sm font-bold text-[#D04848]">{error}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-4">
            <p id="diary-hint" className="mb-4 text-sm text-[#9C8273]">ひとことでも、写真だけでも。今日の思い出を残そう。</p>
            <fieldset disabled={busy} className="min-w-0 space-y-5 disabled:opacity-60">
              <div>
                <label htmlFor="diary-body" className="mb-2 block text-sm font-bold">今日のできごと</label>
                <textarea id="diary-body" className={`${petInput} min-h-[240px] resize-y leading-7`} rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder="今日はどんな一日だった？" maxLength={1000} />
                <p className="mt-1 text-right text-xs text-[#9C8273]">{body.length} / 1,000</p>
              </div>
              <div>
                <button type="button" disabled={files.length >= 4} onClick={() => fileInput.current?.click()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E8B899] bg-[#FFF0E5] px-4 py-4 text-base font-bold text-[#A44D2A] disabled:opacity-50">
                  <Camera size={24} />{files.length >= 4 ? "写真を4枚選びました" : "写真を追加"}<span className="text-xs">{files.length} / 4枚</span>
                </button>
                <p className="mt-2 text-xs text-[#9C8273]">写真ライブラリから選択できます（最大4枚）</p>
                {files.length > 0 && <div className="mt-3 flex flex-wrap gap-3">
                  {files.map((file, i) => (
                    <div key={`${file.name}-${file.lastModified}-${i}`} className="relative pt-2 pr-2">
                      <PhotoPreview file={file} />
                      <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#7A6050] shadow" aria-label={`${i + 1}枚目の写真を外す`}><X size={20} /></button>
                    </div>
                  ))}
                </div>}
              </div>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#F1E1CF] bg-white px-4 py-3">
                <span className="shrink-0 text-sm font-bold">見られる人</span>
                <select className="min-h-11 min-w-0 rounded-xl bg-[#FFF0E5] px-3 text-base text-[#7A6050]" value={visibility} onChange={(e) => setVisibility(e.target.value as PetVisibility)}>
                  {(Object.keys(VISIBILITY_LABEL) as PetVisibility[]).map((v) => <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>)}
                </select>
              </label>
              {visibility === "public" && <p className="text-xs leading-relaxed text-[#9C8273]">写真が「うちの子自慢ギャラリー」に並びます。場所は付きません（写真の位置情報も消して保存します）。</p>}
              <details className="rounded-2xl border border-[#F1E1CF] bg-white p-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold">日付・体重<span className="flex items-center gap-2 text-xs font-normal text-[#9C8273]">{entryDate.replaceAll("-", "/")}<ChevronDown size={16} /></span></summary>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <PetField label="日付"><input type="date" className={petInput} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></PetField>
                  <PetField label="体重（kg・任意）"><input className={petInput} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder="例: 3.4" /></PetField>
                </div>
              </details>
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

              <p className="text-center text-xs text-[#9C8273]">閉じても、このページにいる間は入力内容が残ります。</p>
              <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                const remaining = 4 - files.length;
                setError(picked.length > remaining ? "写真は最大4枚です。先頭から4枚まで追加しました。" : null);
                setFiles((p) => [...p, ...picked].slice(0, 4));
                e.target.value = "";
              }} />
            </fieldset>
          </div>
        </div>
      </dialog>
    </>
  );
}

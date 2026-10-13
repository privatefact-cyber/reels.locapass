"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ImagePlus, Loader2, MapPin, Sparkles } from "lucide-react";
import exifr from "exifr";
import { geocode } from "@/lib/map/geocode";
import { PHOTO_MAX_BYTES } from "@/lib/photo/tags";

type Candidate = {
  kind: "listed" | "spot";
  name: string;
  address: string | null;
  distance_m: number;
  venue_id?: string;
  place_id?: string;
};

/** AIに送る写真は長辺1024pxのJPEGに縮小する(転送量とAIの処理を軽くする)。縮小できない形式(HEIC等)は元のまま。 */
async function downscale(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], "ai.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function PhotoComposer({ canOperator }: { canOperator: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsNote, setCoordsNote] = useState<string | null>(null);
  const [needAddress, setNeedAddress] = useState(false);
  const [address, setAddress] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pick, setPick] = useState<Candidate | null>(null);
  const [spotName, setSpotName] = useState("");
  const [comment, setComment] = useState("");
  const [asOperator, setAsOperator] = useState(false);
  // AIが作った一言。入力欄にはプレースホルダーとして出し、空のまま投稿されたらこれを採用する。
  const [aiComment, setAiComment] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function loadCandidates(c: { lat: number; lng: number }) {
    try {
      const res = await fetch(`/api/places/nearby?lat=${c.lat}&lng=${c.lng}`);
      if (!res.ok) return;
      const data = (await res.json()) as { candidates?: Candidate[] };
      setCandidates(data.candidates ?? []);
    } catch {
      // 候補が取れなくても、店名の手入力で投稿できる。
    }
  }

  async function handleFile(f: File) {
    setError(null);
    if (f.size > PHOTO_MAX_BYTES) {
      setError("画像サイズは15MB以下にしてください。");
      return;
    }
    setFile(f);
    setAiComment(null);
    setSpotName("");
    setPreviewUrl(URL.createObjectURL(f));
    setCandidates([]);
    setPick(null);
    setCoords(null);
    setNeedAddress(false);
    setCoordsNote("写真の位置情報を確認しています…");
    try {
      const gps = await exifr.gps(f);
      if (gps && typeof gps.latitude === "number" && typeof gps.longitude === "number") {
        const c = { lat: gps.latitude, lng: gps.longitude };
        setCoords(c);
        setCoordsNote("写真から位置情報を検出しました。");
        void loadCandidates(c);
        return;
      }
    } catch {
      // 位置情報が読めない写真は、下の住所入力にフォールバックする。
    }
    setCoordsNote("この写真には位置情報がありません。場所の住所や地名を入力してください。");
    setNeedAddress(true);
  }

  async function lookupAddress() {
    if (!address.trim()) return;
    setError(null);
    const hit = await geocode(address);
    if (!hit) {
      setError("住所から位置を特定できませんでした。別の書き方でお試しください。");
      return;
    }
    setCoords(hit);
    setCoordsNote("入力した場所から位置を設定しました。");
    void loadCandidates(hit);
  }

  async function generateWithAi() {
    if (!file || aiBusy) return;
    setAiBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("image", await downscale(file));
      body.append("address", address);
      const res = await fetch("/api/photo/caption", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { spotName?: string; comment?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "うまく生成できませんでした。手入力でも投稿できます。");
      } else {
        // 店名は必須項目なので実際の値として入れる。一言は投稿者が自分の言葉で書く余地を残して候補表示にする。
        if (data.spotName && !pick) setSpotName(data.spotName);
        if (data.comment) setAiComment(data.comment);
      }
    } catch {
      setError("通信に失敗しました。もう一度お試しください。");
    }
    setAiBusy(false);
  }

  function choose(c: Candidate) {
    if (pick === c) {
      setPick(null);
      return;
    }
    setPick(c);
    setSpotName(c.name);
    if (c.address && !address) setAddress(c.address);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !coords || busy) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("image", file);
    body.append("spot_name", spotName);
    body.append("comment", comment.trim() || aiComment || "");
    body.append("address", address);
    body.append("latitude", String(coords.lat));
    body.append("longitude", String(coords.lng));
    if (pick) {
      body.append("place_kind", pick.kind);
      if (pick.kind === "listed" && pick.venue_id) body.append("venue_id", pick.venue_id);
      if (pick.kind === "spot" && pick.place_id) body.append("place_id", pick.place_id);
    }
    if (canOperator && asOperator) body.append("as_operator", "true");
    try {
      const res = await fetch("/api/photo/posts", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "投稿に失敗しました。もう一度お試しください。");
        setBusy(false);
        return;
      }
      router.push("/photo");
      router.refresh();
    } catch {
      setError("通信に失敗しました。もう一度お試しください。");
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-xl border border-main/15 bg-panel-950 px-3 py-2.5 text-sm text-main placeholder:text-tone-600 focus:border-hl-400/60 focus:outline-none";

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4 px-4 pb-24 pt-3">
      <Link href="/photo" className="flex items-center gap-1 text-sm text-tone-300 hover:text-main">
        <ChevronLeft size={18} />
        みんなのフォト
      </Link>
      <h1 className="text-lg font-medium text-main">写真を投稿</h1>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-main/25 bg-panel-950 text-tone-500"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm">
            <ImagePlus size={28} />
            写真を選ぶ
          </span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {file ? (
        <button
          type="button"
          onClick={generateWithAi}
          disabled={aiBusy}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-main/15 py-2.5 text-sm text-tone-300 transition hover:border-hl-400/50 hover:text-main disabled:opacity-50"
        >
          {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {aiBusy ? "AIが考えています…" : "✨ AIにおまかせ生成"}
        </button>
      ) : null}

      {coordsNote ? (
        <p className="flex items-start gap-1 text-xs text-tone-500">
          <MapPin size={12} className="mt-0.5 shrink-0" />
          {coordsNote}
        </p>
      ) : null}

      {needAddress ? (
        <div className="flex gap-2">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="例: 東京都渋谷区神宮前5-3-12"
            className={input}
          />
          <button type="button" onClick={lookupAddress} className="shrink-0 rounded-xl border border-main/15 px-3 text-xs text-tone-300 hover:text-main">
            位置を確認
          </button>
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-tone-500">近くの場所から選ぶ</p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => (
              <button
                key={`${c.kind}:${c.venue_id ?? c.place_id}`}
                type="button"
                onClick={() => choose(c)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                  pick === c ? "border-hl-400 text-main" : "border-main/15 text-tone-300 hover:text-main"
                }`}
              >
                <span className="rounded-full bg-tone-700 px-1.5 py-0.5 text-[9px] text-main">
                  {c.kind === "listed" ? "掲載店" : "穴場"}
                </span>
                {c.name}
                <span className="text-[10px] text-tone-500">{c.distance_m}m</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs text-tone-500">おすすめの場所・店名（必須）</span>
        <input value={spotName} onChange={(e) => setSpotName(e.target.value)} required maxLength={100} className={input} placeholder="例: 千波湖の桜並木" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-tone-500">ひとこと（任意）</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} className={input} placeholder={aiComment ?? "どんな場所か、おすすめポイントなど"} />
      </label>

      {canOperator ? (
        <label className="flex items-center gap-2 text-sm text-tone-300">
          <input type="checkbox" checked={asOperator} onChange={(e) => setAsOperator(e.target.checked)} />
          運営として投稿する（表示名: LOCAPASS運営）
        </label>
      ) : null}

      {error ? <p className="rounded-xl bg-red-950/60 px-3 py-2 text-xs text-red-300">{error}</p> : null}

      <button
        type="submit"
        disabled={!file || !coords || !spotName.trim() || busy}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-cta-light py-3 text-sm font-bold tracking-wide text-on-cta-gold transition hover:bg-cta-hover disabled:opacity-40"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : null}
        {busy ? "投稿しています…" : "投稿する"}
      </button>
      <p className="text-center text-[11px] text-tone-600">不適切な写真は、AIによる確認で投稿できないことがあります。</p>
    </form>
  );
}

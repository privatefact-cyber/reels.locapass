"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ImagePlus, Loader2, MapPin, Sparkles } from "lucide-react";
import exifr from "exifr";
import { geocode, reverseGeocode } from "@/lib/map/geocode";
import { PHOTO_MAX_BYTES } from "@/lib/photo/tags";
import { uploadPhotoVideoToR2 } from "@/lib/storage/uploadToR2";
import { readVideoGps } from "@/lib/photo/videoGps";
import { useLocale } from "@/components/i18n/LocaleProvider";

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

// Vercelは1回のリクエストが約4.5MBまで(超えるとサーバーの処理に届く前に413で止まる)。
// フォームの他の項目ぶんを見込んで、写真は4MB以下にして送る。
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/**
 * 投稿する写真を、長辺を縮め・JPEGの画質を下げながら UPLOAD_MAX_BYTES 以下にする。
 * (表示は最大1920pxなので、2560px/画質0.85でも見た目は変わらない。位置情報は縮小前の元の写真から読み取り済み。)
 * 縮小できない形式(HEICなどをブラウザが読めない場合)は、元のままで足りれば送り、大きすぎれば null。
 */
async function prepareUpload(file: File): Promise<File | null> {
  if (file.size <= UPLOAD_MAX_BYTES && file.type !== "image/heic" && file.type !== "image/heif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    for (const [maxEdge, quality] of [
      [2560, 0.85],
      [2048, 0.8],
      [1600, 0.75],
      [1280, 0.7],
    ] as const) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= UPLOAD_MAX_BYTES) return new File([blob], "photo.jpg", { type: "image/jpeg" });
    }
    return null;
  } catch {
    return file.size <= UPLOAD_MAX_BYTES ? file : null;
  }
}

const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const VIDEO_MAX_SECONDS = 30;
const isVideoFile = (f: File) => f.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(f.name);
const VIDEO_EXT = /\.(mp4|mov|webm)$/i;

/** 1コマの「見映え」の点数。暗すぎる(暗転)・のっぺり(フェードイン)は低く、明るさと明暗の差があるほど高い。 */
function frameScore(video: HTMLVideoElement): number {
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = 48;
  const ctx = c.getContext("2d");
  if (!ctx) return 0;
  ctx.drawImage(video, 0, 0, 48, 48);
  const { data } = ctx.getImageData(0, 0, 48, 48);
  let sum = 0;
  let sumSq = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += y;
    sumSq += y * y;
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  return mean < 20 ? std * 0.1 : std + Math.min(mean, 128) * 0.2;
}

type PosterResult = { ok: true; poster: File; duration: number } | { ok: false; stage: string };

/** イベントを待つ。来なくてもタイムアウトで先に進む(iPhone Safariは、seekedなどが来ないことがあるため)。 */
function waitEvent(video: HTMLVideoElement, names: string[], ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (value: boolean) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      names.forEach((n) => video.removeEventListener(n, onOk));
      video.removeEventListener("error", onErr);
      resolve(value);
    };
    const onOk = () => finish(true);
    const onErr = () => finish(false);
    const timer = window.setTimeout(() => finish(false), ms);
    names.forEach((n) => video.addEventListener(n, onOk, { once: true }));
    video.addEventListener("error", onErr, { once: true });
  });
}

/**
 * 動画の1コマ(ポスター)と長さを取り出す。ポスターは一覧の表示と、AIの審査・タグ付けに使う
 * (動画本体はブラウザからR2へ直接送るので、サーバーのAIには画像の1コマだけを渡す)。
 * 冒頭は暗転・フェードインのことが多いので、15% / 40% / 65% の位置から3コマを試し、見映えのよい1コマを選ぶ。
 *
 * iPhone Safari対策: 画面に置いていない<video>はコマを描画しないことがあるので、見えない状態でDOMに置く。
 * muted/playsinline を属性でも付け、loadeddata(コマが使える状態)を待つ。seekedが来なくてもタイムアウトで続行し、
 * 少し待ってから描く。全滅したら、一瞬だけ再生して(無音)そのコマを使う。失敗は段階のコードで返す。
 */
async function extractPoster(file: File): Promise<PosterResult> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  try {
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "auto";
    Object.assign(video.style, { position: "fixed", left: "-9999px", top: "0", width: "2px", height: "2px", opacity: "0", pointerEvents: "none" });
    document.body.appendChild(video);
    video.src = url;
    video.load();

    let ready = video.readyState >= 2 || (await waitEvent(video, ["loadeddata"], 8000));
    if (!ready) {
      // コマが使える状態にならないときは、無音で一瞬再生して読み込みを促す。
      try {
        await video.play();
      } catch {
        /* 自動再生が許可されない場合は、そのまま続ける */
      }
      ready = video.readyState >= 2 || (await waitEvent(video, ["loadeddata", "playing"], 3000));
      video.pause();
    }
    if (video.readyState < 1) return { ok: false, stage: "load" };
    const duration = video.duration;
    if (!video.videoWidth || !video.videoHeight) return { ok: false, stage: "size" };

    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, stage: "canvas" };

    let bestBlob: Blob | null = null;
    let bestScore = -1;
    const capture = async () => {
      try {
        const score = frameScore(video);
        if (score > bestScore) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
          if (blob) {
            bestBlob = blob;
            bestScore = score;
          }
        }
      } catch {
        /* このコマは使えない(次のコマを試す) */
      }
    };

    const points = Number.isFinite(duration) && duration > 0 ? [0.15, 0.4, 0.65] : [0];
    for (const p of points) {
      video.currentTime = Number.isFinite(duration) ? duration * p : 0;
      await waitEvent(video, ["seeked"], 2500);
      await new Promise((r) => window.setTimeout(r, 120)); // コマが描画されるのを少し待つ(iPhone)
      await capture();
    }

    if (!bestBlob) {
      // 全部だめだったら、一瞬だけ(無音で)再生して、そのコマを使う。
      try {
        await video.play();
        await new Promise((r) => window.setTimeout(r, 600));
        video.pause();
      } catch {
        /* 再生できないなら、現在のコマを試す */
      }
      await capture();
    }
    if (!bestBlob) return { ok: false, stage: "draw" };
    return { ok: true, poster: new File([bestBlob], "poster.jpg", { type: "image/jpeg" }), duration: Number.isFinite(duration) ? duration : 0 };
  } catch {
    return { ok: false, stage: "error" };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}

/** 店舗ページから来たとき、その店を最初から「掲載店」として選んだ状態にするための指定。 */
export type PhotoComposerPreset = { venueId: string; name: string; address: string | null };

export function PhotoComposer({ canOperator, preset }: { canOperator: boolean; preset?: PhotoComposerPreset }) {
  const { t } = useLocale();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsNote, setCoordsNote] = useState<string | null>(null);
  const [needAddress, setNeedAddress] = useState(false);
  const [address, setAddress] = useState("");
  // 投稿者が住所欄を自分で書き換えたか。自動入力(逆引き・候補選択)は、書き換えていないときだけ上書きする。
  const [addressDirty, setAddressDirtyState] = useState(false);
  const addressDirtyRef = useRef(false);
  function setAddressDirty(v: boolean) {
    addressDirtyRef.current = v;
    setAddressDirtyState(v);
  }
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  // 店舗ページから来たときは、その店を選択済みにしておく(写真を選び直しても保たれる)。
  const presetPick: Candidate | null = preset
    ? { kind: "listed", name: preset.name, address: preset.address, distance_m: 0, venue_id: preset.venueId }
    : null;
  const [pick, setPick] = useState<Candidate | null>(presetPick);
  const [spotName, setSpotName] = useState(preset?.name ?? "");
  const [comment, setComment] = useState("");
  const [asOperator, setAsOperator] = useState(false);
  // AIが作った一言。入力欄にはプレースホルダーとして出し、空のまま投稿されたらこれを採用する。
  const [aiComment, setAiComment] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  // 動画投稿: posterFile=動画の1コマ(一覧表示とAI審査用の画像)。
  const [isVideo, setIsVideo] = useState(false);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  // 送信の段階: uploading=動画をR2へ送信中(進み具合あり) / checking=AIの確認と保存中。
  const [phase, setPhase] = useState<"idle" | "uploading" | "checking">("idle");
  const [uploadInfo, setUploadInfo] = useState<{ pct: number; loaded: number; total: number; etaSec: number | null } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // 送信中にうっかり閉じる/戻ると、動画のアップロードが途中で切れるので、確認を出す。
  useEffect(() => {
    if (!busy) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy]);

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

  // 写真/動画から取れた位置を住所にして入力欄に入れる(投稿者が直し始めていなければ)。取れなくても手入力で進められる。
  async function fillAddressFromCoords(c: { lat: number; lng: number }) {
    const found = await reverseGeocode(c.lat, c.lng);
    if (found) setAddress((cur) => (addressDirtyRef.current && cur ? cur : found));
  }

  async function handleVideo(f: File) {
    if (f.size > VIDEO_MAX_BYTES) {
      setError(t.photo.errVideoTooLarge);
      return;
    }
    if (!VIDEO_EXT.test(f.name)) {
      setError(t.photo.errVideoFormat);
      return;
    }
    setCoordsNote(null);
    setPreparing(true);
    const r = await extractPoster(f);
    setPreparing(false);
    if (!r.ok) {
      // どの段階で止まったかを、コードで添える(iPhoneなど端末ごとの不具合の切り分け用)。
      setError(`${t.photo.errVideoPoster} (code ${r.stage})`);
      return;
    }
    if (r.duration > VIDEO_MAX_SECONDS + 0.5) {
      setError(t.photo.errVideoTooLong);
      return;
    }
    setFile(f);
    setIsVideo(true);
    setPosterFile(r.poster);
    setAiComment(null);
    setSpotName(preset?.name ?? "");
    setPreviewUrl(URL.createObjectURL(f));
    setCandidates([]);
    setPick(presetPick);
    setCoords(null);
    setAddress("");
    setAddressDirty(false);
    // 動画の管理情報(moov)にある撮影場所を読む。無ければ住所・地名の入力に進む。
    const gps = await readVideoGps(f);
    if (gps) {
      setCoords(gps);
      setCoordsNote(t.photo.gpsFoundVideo);
      void loadCandidates(gps);
      void fillAddressFromCoords(gps);
      return;
    }
    setCoordsNote(t.photo.gpsNoneVideo);
    setNeedAddress(true);
  }

  async function handleFile(f: File) {
    setError(null);
    if (isVideoFile(f)) {
      await handleVideo(f);
      return;
    }
    if (f.size > PHOTO_MAX_BYTES) {
      setError(t.photo.errTooLarge15);
      return;
    }
    setIsVideo(false);
    setPosterFile(null);
    setFile(f);
    setAiComment(null);
    setSpotName(preset?.name ?? "");
    setPreviewUrl(URL.createObjectURL(f));
    setCandidates([]);
    setPick(presetPick);
    setCoords(null);
    setAddress("");
    setAddressDirty(false);
    setNeedAddress(false);
    setCoordsNote(t.photo.gpsChecking);
    try {
      const gps = await exifr.gps(f);
      if (gps && typeof gps.latitude === "number" && typeof gps.longitude === "number") {
        const c = { lat: gps.latitude, lng: gps.longitude };
        setCoords(c);
        setCoordsNote(t.photo.gpsFound);
        void loadCandidates(c);
        void fillAddressFromCoords(c);
        return;
      }
    } catch {
      // 位置情報が読めない写真は、下の住所入力にフォールバックする。
    }
    setCoordsNote(t.photo.gpsNone);
    setNeedAddress(true);
  }

  async function lookupAddress() {
    if (!address.trim()) return;
    setError(null);
    const hit = await geocode(address);
    if (!hit) {
      setError(t.photo.errGeocode);
      return;
    }
    setCoords(hit);
    setAddressDirty(false);
    setCoordsNote(t.photo.gpsFromAddress);
    void loadCandidates(hit);
  }

  async function generateWithAi() {
    if (!file || aiBusy) return;
    setAiBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("image", await downscale(isVideo && posterFile ? posterFile : file));
      body.append("address", address);
      const res = await fetch("/api/photo/caption", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { spotName?: string; comment?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? t.photo.errAiFailed);
      } else {
        // 店名・一言とも、入力欄に実際の値として入れる(生成のあとも、投稿者が自由に直せる)。
        // 掲載店を選んでいるときは、店名はそのまま残す。
        if (data.spotName && !pick) setSpotName(data.spotName);
        if (data.comment) {
          setComment(data.comment);
          setAiComment(null);
        }
      }
    } catch {
      setError(t.photo.errNetwork);
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
    if (c.address && (!address || !addressDirty)) setAddress(c.address);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !coords || busy) return;
    setBusy(true);
    setError(null);
    // 住所を書き換えたまま「位置を確認」を押していなければ、ここで位置を取り直す(ピンの位置と住所がずれたまま投稿されないように)。
    let postCoords = coords;
    if (addressDirty && address.trim()) {
      const hit = await geocode(address);
      if (!hit) {
        setError(t.photo.errAddressStale);
        setBusy(false);
        return;
      }
      postCoords = hit;
      setCoords(hit);
      setAddressDirty(false);
    }
    // 動画: まず動画本体をR2へ直接送る(Vercelのサイズ制限を受けない)。画像(1コマ)は従来どおりAPIへ。
    let videoUrl: string | null = null;
    if (isVideo) {
      const startedAt = Date.now();
      try {
        setPhase("uploading");
        setUploadInfo({ pct: 0, loaded: 0, total: file.size, etaSec: null });
        videoUrl = await uploadPhotoVideoToR2(file, ({ ratio, loaded, total }) => {
          const elapsed = (Date.now() - startedAt) / 1000;
          // 残り時間は、ある程度送ってから(誤差が大きい冒頭は出さない)、ここまでの平均速度で見積もる。
          const etaSec = elapsed > 2 && ratio > 0.03 ? Math.max(1, Math.round((elapsed / ratio) * (1 - ratio))) : null;
          setUploadInfo({ pct: Math.round(ratio * 100), loaded, total, etaSec });
        });
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t.photo.errNetwork);
        setPhase("idle");
        setUploadInfo(null);
        setBusy(false);
        return;
      }
    }
    setPhase("checking");
    const upload = await prepareUpload(isVideo && posterFile ? posterFile : file);
    if (!upload) {
      setError(t.photo.errCannotSend);
      setPhase("idle");
      setUploadInfo(null);
      setBusy(false);
      return;
    }
    const body = new FormData();
    body.append("image", upload);
    if (videoUrl) body.append("video_url", videoUrl);
    body.append("spot_name", spotName);
    body.append("comment", comment.trim() || aiComment || "");
    body.append("address", address);
    body.append("latitude", String(postCoords.lat));
    body.append("longitude", String(postCoords.lng));
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
        // 413はサーバーの手前で止められるのでJSONが返らない(上限を超えた場合)。
        setError(
          data.error ??
            (res.status === 413
              ? t.photo.errPayload
              : `${t.photo.apiPostFailed} (code ${res.status})`),
        );
        setPhase("idle");
        setUploadInfo(null);
        setBusy(false);
        return;
      }
      router.push("/photo");
      router.refresh();
    } catch {
      setError(t.photo.errNetwork);
      setPhase("idle");
      setUploadInfo(null);
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-xl border border-main/15 bg-panel-950 px-3 py-2.5 text-sm text-main placeholder:text-tone-600 focus:border-hl-400/60 focus:outline-none";

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4 px-4 pb-24 pt-3">
      <Link href="/photo" className="flex items-center gap-1 text-sm text-tone-300 hover:text-main">
        <ChevronLeft size={18} />
        {t.photo.backToPhotos}
      </Link>
      <h1 className="text-lg font-medium text-main">{t.photo.composeTitle}</h1>

      {isVideo && previewUrl ? (
        <div className="space-y-2">
          <video
            src={previewUrl}
            controls
            muted
            playsInline
            className="aspect-[4/3] w-full rounded-2xl bg-black object-contain"
          />
          <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-tone-300 underline">
            {t.photo.chooseMedia}
          </button>
        </div>
      ) : (
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
              {t.photo.chooseMedia}
            </span>
          )}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
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
          {aiBusy ? t.photo.aiThinking : t.photo.aiGenerate}
        </button>
      ) : null}

      {preparing ? (
        <p className="flex items-center gap-2 text-xs text-tone-500">
          <Loader2 size={12} className="animate-spin" />
          {t.photo.videoPreparing}
        </p>
      ) : null}

      {coordsNote ? (
        <p className="flex items-start gap-1 text-xs text-tone-500">
          <MapPin size={12} className="mt-0.5 shrink-0" />
          {coordsNote}
        </p>
      ) : null}

      {file ? (
        <div className="space-y-1">
          <span className="text-xs text-tone-500">{t.photo.addressLabel}</span>
          <div className="flex gap-2">
            <input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setAddressDirty(true);
              }}
              placeholder={t.photo.addressPlaceholder}
              className={input}
            />
            <button type="button" onClick={lookupAddress} className="shrink-0 rounded-xl border border-main/15 px-3 text-xs text-tone-300 hover:text-main">
              {t.photo.checkLocation}
            </button>
          </div>
          {coords && !needAddress ? <p className="text-[11px] text-tone-500">{t.photo.addressFixHint}</p> : null}
        </div>
      ) : null}

      {preset && pick?.venue_id === preset.venueId ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-hl-400/50 bg-tone-900/60 px-3 py-2 text-sm text-main">
          <span className="min-w-0 truncate">📍 {t.photo.postingTo(preset.name)}</span>
          <button
            type="button"
            onClick={() => {
              setPick(null);
              setSpotName("");
            }}
            className="shrink-0 text-xs text-tone-400 underline"
          >
            {t.photo.postingToClear}
          </button>
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-tone-500">{t.photo.nearbyTitle}</p>
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
                  {c.kind === "listed" ? t.photo.badgeListed : t.photo.badgeSpot}
                </span>
                {c.name}
                <span className="text-[10px] text-tone-500">{c.distance_m}m</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs text-tone-500">{t.photo.spotLabel}</span>
        <input value={spotName} onChange={(e) => setSpotName(e.target.value)} required maxLength={100} className={input} placeholder={t.photo.spotPlaceholder} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-tone-500">{t.photo.commentLabel}</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} className={input} placeholder={aiComment ?? t.photo.commentPlaceholder} />
      </label>

      {canOperator ? (
        <label className="flex items-center gap-2 text-sm text-tone-300">
          <input type="checkbox" checked={asOperator} onChange={(e) => setAsOperator(e.target.checked)} />
          {t.photo.asOperator}
        </label>
      ) : null}

      {error ? <p className="rounded-xl bg-red-950/60 px-3 py-2 text-xs text-red-300">{error}</p> : null}

      {busy && isVideo ? (
        <div className="space-y-1.5" role="status" aria-live="polite">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-tone-800"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={phase === "checking" ? 100 : (uploadInfo?.pct ?? 0)}
          >
            {/* アップロードは全体の9割まで。残りの1割は、AIの確認と保存(進み具合は取れないので動かし続ける)。 */}
            <div
              className={`h-full rounded-full bg-cta-light transition-[width] duration-300 ${phase === "checking" ? "animate-pulse" : ""}`}
              style={{ width: phase === "checking" ? "100%" : `${Math.round((uploadInfo?.pct ?? 0) * 0.9)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-tone-500">
            <span>
              {phase === "uploading" && uploadInfo
                ? `${uploadInfo.pct}%（${(uploadInfo.loaded / 1048576).toFixed(1)} / ${(uploadInfo.total / 1048576).toFixed(1)} MB）`
                : t.photo.videoChecking}
            </span>
            <span>{phase === "uploading" && uploadInfo?.etaSec ? t.photo.videoEta(uploadInfo.etaSec) : ""}</span>
          </div>
          <p className="text-[11px] text-tone-600">{t.photo.keepOpen}</p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!file || !coords || !spotName.trim() || busy}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-cta-light py-3 text-sm font-bold tracking-wide text-on-cta-gold transition hover:bg-cta-hover disabled:opacity-40"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : null}
        {busy ? (phase === "uploading" && uploadInfo ? t.photo.videoUploading(uploadInfo.pct) : phase === "checking" && isVideo ? t.photo.videoChecking : t.photo.submitting) : t.photo.submit}
      </button>
      <p className="text-center text-[11px] text-tone-600">{isVideo ? `${t.photo.videoNote} ` : ""}{t.photo.moderationNote}</p>
    </form>
  );
}

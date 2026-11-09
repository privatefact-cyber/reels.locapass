"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { composeFlyerJpeg } from "@/lib/social/composeFlyer";
import { imageToReelFile } from "@/lib/social/imageToReel";

type Result = { ok: boolean; message: string };
type MediaKind = "none" | "upload" | "shop-photo" | "shop-video" | "ai-image" | "upload-photo" | "upload-video" | "reel-ai" | "reel-shop-photo" | "reel-upload-photo";

const MEDIA_LABEL: Record<MediaKind, { title: string; hint: string; soon?: boolean }> = {
  "shop-photo": { title: "掲載店舗の写真(自動で選ぶ)", hint: "店名・リンク・お店のタグつきの定型文" },
  "shop-video": { title: "掲載店舗の動画(自動で選ぶ)", hint: "自前のサーバーにある動画だけ。店名・リンク・タグつき" },
  "ai-image": { title: "AIで画像を作る", hint: "街の雰囲気の画像を、AIが作ります" },
  upload: { title: "自分の写真・動画をアップロード", hint: "写真はJPEG・PNG・WebP(3MBまで)、動画はMP4・MOV(200MBまで)。ドロップでもOK" },
  "upload-photo": { title: "自分の写真をアップロード", hint: "JPEG・PNG・WebP、3MBまで" },
  "upload-video": { title: "自分の動画をアップロード", hint: "MP4・MOV、200MBまで。縦長(9:16)が基本" },
  none: { title: "画像・動画なし(文章だけ)", hint: "Threadsにだけ出せます" },
  "reel-ai": { title: "AIで画像を作って、動画にする", hint: "リールに出したいときだけ。約6秒の動画にします" },
  "reel-shop-photo": { title: "掲載店舗の写真を、動画にする(自動で選ぶ)", hint: "リールに出したいときだけ" },
  "reel-upload-photo": { title: "自分の写真を、動画にする", hint: "リールに出したいときだけ。JPEG・PNG・WebP、3MBまで" },
};

/** 素材の選択肢。投稿先は、下書きができたあとにカードで選ぶ(写真→Instagramフィード+Threads / 動画→リール+Threads / なし→Threadsだけ)。 */
const MEDIA_OPTIONS: MediaKind[] = ["shop-photo", "ai-image", "upload", "shop-video", "none", "reel-ai", "reel-shop-photo", "reel-upload-photo"];

/**
 * AIに見せるための、小さな画像(最大768px・JPEG)を作る。写真はそのまま縮小、動画は冒頭の1コマ。
 * 失敗しても、投稿の作成は止めない(その場合、AIは画像を見ずに文章を書く)。
 */
async function makeImageHint(file: File): Promise<Blob | null> {
  try {
    const MAX = 768;
    const draw = (source: CanvasImageSource, w: number, h: number): Promise<Blob | null> => {
      const scale = Math.min(1, MAX / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
      return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.75));
    };
    if (file.type.startsWith("image/")) {
      const bitmap = await createImageBitmap(file);
      const blob = await draw(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      return blob;
    }
    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      try {
        const video = document.createElement("video");
        video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = url;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("timeout")), 8000);
          video.onloadeddata = () => { video.currentTime = Math.min(0.5, (video.duration || 1) / 2); };
          video.onseeked = () => { clearTimeout(timer); resolve(); };
          video.onerror = () => { clearTimeout(timer); reject(new Error("video")); };
        });
        return await draw(video, video.videoWidth, video.videoHeight);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch {
    // 画像を作れなくても続ける
  }
  return null;
}

const chip = (selected: boolean, disabled = false) =>
  `rounded-lg border px-3 py-2 text-left text-sm ${disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" : selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"}`;

export function PostComposer({ action, flyerAction, reelPrepare, reelSave }: {
  action: (formData: FormData) => Promise<Result>;
  flyerAction: (account: string, theme: string) => Promise<{ ok: boolean; message: string; dataUrl?: string }>;
  reelPrepare: (formData: FormData) => Promise<{ ok: boolean; message: string; dataUrl?: string; body?: string; topicId?: string; source?: "ai" | "manual" }>;
  reelSave: (input: { dest: string; videoUrl: string; body: string; topicId: string; source: "ai" | "manual" }) => Promise<Result>;
}) {
  const router = useRouter();
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [account, setAccount] = useState<"locapass" | "luxela">("locapass");
  const [textMode, setTextMode] = useState<"auto" | "manual">("auto");
  const [audience, setAudience] = useState("public");
  const [note, setNote] = useState("");
  const [body, setBody] = useState("");
  const [style, setStyle] = useState<"photo" | "illustration" | "flyer">("photo");
  const [headline, setHeadline] = useState("");
  const [media, setMedia] = useState<MediaKind>("ai-image");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState("");
  const [notice, setNotice] = useState<Result | null>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const pickedIsVideo = Boolean(picked && picked.type.startsWith("video/"));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!picked) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(picked);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [picked]);

  /** ドロップ・選択されたファイルが、使える写真か動画か確認して受け取る。 */
  const takeFile = (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"].includes(file.type)) { setNotice({ ok: false, message: "写真(JPEG・PNG・WebP)か、動画(MP4・MOV)を選んでください" }); return; }
    setNotice(null);
    setPicked(file);
  };

  const isShopMedia = media === "shop-photo" || media === "shop-video" || media === "reel-shop-photo";

  const submit = async () => {
    setNotice(null);
    if (textMode === "manual" && !body.trim()) { setNotice({ ok: false, message: "投稿の文章を入力してください" }); return; }
    // 「自分の写真・動画」は、選んだファイルの種類で、写真か動画かを決める。
    const kind: MediaKind = media === "upload" ? (pickedIsVideo ? "upload-video" : "upload-photo") : media;
    if (media === "upload" && !picked) { setNotice({ ok: false, message: "写真か動画を選んでください(ここにドロップもできます)" }); return; }
    if (media === "upload" && picked && !pickedIsVideo && picked.size > 3 * 1024 * 1024) { setNotice({ ok: false, message: `写真が大きすぎます(${(picked.size / 1024 / 1024).toFixed(1)}MB)。3MB以下にしてください` }); return; }
    const fd = new FormData();
    // 投稿先は、下書きができたあとに選ぶ。ここでは仮に Threads としておく(カードの投稿先チェックで確定する)。
    fd.set("dest", `threads:${account}`);
    fd.set("form", "post");
    fd.set("textMode", textMode);
    fd.set("audience", audience);
    fd.set("note", note);
    fd.set("body", body);
    fd.set("mediaKind", kind);
    fd.set("style", style);
    fd.set("headline", headline);
    setBusy(true); setProgress(null);
    // 自分の写真・動画は、AIに見せる小さな画像を添える(文章を、画像に合わせて書かせるため)。
    if (textMode === "auto") {
      const hintSource = media === "upload" ? picked : media === "reel-upload-photo" ? photoRef.current?.files?.[0] ?? null : null;
      if (hintSource) {
        setStage("画像を確認しています…");
        const hint = await makeImageHint(hintSource);
        if (hint) fd.set("imageHint", new File([hint], "hint.jpg", { type: "image/jpeg" }));
        setStage("");
      }
    }
    try {
      if (media === "reel-ai" || media === "reel-shop-photo" || media === "reel-upload-photo") {
        // 画像から作るリール: 文章と画像を用意(サーバー) → ブラウザで動画にする → R2へ送る → 下書きにする
        if (media === "reel-upload-photo") {
          const file = photoRef.current?.files?.[0];
          if (!file) throw new Error("写真を選んでください");
          fd.set("photo", file);
        }
        setStage("画像と文章を用意しています…(AIの画像は最大1分ほど)");
        const prepared = await reelPrepare(fd);
        if (!prepared.ok || !prepared.dataUrl || !prepared.body || !prepared.topicId) throw new Error(prepared.message || "リールの準備に失敗しました");
        setStage("動画に変換しています…(初回は1分ほどかかることがあります)");
        setProgress(0);
        const file = await imageToReelFile(prepared.dataUrl, (p) => setProgress(p));
        setStage("動画をアップロードしています…");
        const created = await fetch("/api/r2/presigned-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: "social_admin", contentType: "video/mp4", size: file.size }) });
        if (!created.ok) throw new Error(((await created.json().catch(() => ({}))) as { error?: string }).error ?? "アップロードの準備に失敗しました");
        const { uploadURL, publicUrl } = (await created.json()) as { uploadURL: string; publicUrl: string };
        const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: file });
        if (!put.ok) throw new Error(`アップロードに失敗しました(${put.status})`);
        const saved = await reelSave({ dest: `threads:${account}`, videoUrl: publicUrl, body: prepared.body, topicId: prepared.topicId, source: prepared.source ?? "manual" });
        setNotice(saved);
        if (saved.ok) { setBody(""); setNote(""); }
        router.refresh();
        return;
      }
      if (media === "ai-image" && style === "flyer") {
        // チラシ: AIが文字なしのイラストを作る → ブラウザで見出しを重ねる → R2へ送る → 下書きにする
        const base = await flyerAction(account, headline || (textMode === "manual" ? body.slice(0, 30) : ""));
        if (!base.ok || !base.dataUrl) throw new Error(base.message || "チラシの背景を作れませんでした");
        const jpeg = await composeFlyerJpeg(base.dataUrl, headline, account === "luxela" ? "LUXELA" : "LOCAPASS");
        const created = await fetch("/api/r2/presigned-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: "social_admin", contentType: "image/jpeg", size: jpeg.size }) });
        if (!created.ok) throw new Error(((await created.json().catch(() => ({}))) as { error?: string }).error ?? "アップロードの準備に失敗しました");
        const { uploadURL, publicUrl } = (await created.json()) as { uploadURL: string; publicUrl: string };
        const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: jpeg });
        if (!put.ok) throw new Error(`アップロードに失敗しました(${put.status})`);
        fd.set("mediaKind", "upload-photo-url");
        fd.set("photoUrl", publicUrl);
      }
      if (kind === "upload-photo") {
        const file = media === "upload" ? picked : photoRef.current?.files?.[0];
        if (!file) throw new Error("写真を選んでください");
        fd.set("photo", file);
      }
      if (kind === "upload-video") {
        const file = media === "upload" ? picked : videoRef.current?.files?.[0];
        if (!file) throw new Error("動画を選んでください");
        if (!["video/mp4", "video/quicktime"].includes(file.type)) throw new Error("MP4またはMOVの動画を選んでください");
        if (file.size > 200 * 1024 * 1024) throw new Error("動画は200MB以下にしてください");
        const created = await fetch("/api/r2/presigned-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: "social_admin", contentType: file.type, size: file.size }) });
        if (!created.ok) throw new Error(((await created.json().catch(() => ({}))) as { error?: string }).error ?? "アップロードの準備に失敗しました");
        const { uploadURL, publicUrl } = (await created.json()) as { uploadURL: string; publicUrl: string };
        setProgress(0);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadURL);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`アップロードに失敗しました(${xhr.status})`)));
          xhr.onerror = () => reject(new Error("通信に失敗しました"));
          xhr.send(file);
        });
        fd.set("videoUrl", publicUrl);
      }
      const result = await action(fd);
      setNotice(result);
      if (result.ok) { setBody(""); setNote(""); setPicked(null); }
      router.refresh();
    } catch (e) {
      setNotice({ ok: false, message: e instanceof Error ? e.message : "失敗しました" });
    } finally {
      setBusy(false); setProgress(null); setStage("");
    }
  };

  const step = "space-y-2 rounded-lg border border-slate-200 p-3";
  const stepTitle = "text-sm font-bold text-slate-900";
  return (
    <div className="space-y-4">
      <div className={step}>
        <p className={stepTitle}>① どちらのサービスの投稿ですか</p>
        <div className="flex flex-wrap gap-2">
          {(["locapass", "luxela"] as const).map((a) => <button key={a} type="button" disabled={busy} onClick={() => setAccount(a)} className={chip(account === a)}>{a === "locapass" ? "LOCAPASS" : "LUXELA"}</button>)}
        </div>
        <p className="text-xs text-slate-600">投稿先(Instagram・Threads)は、下書きができたあとに、カードのチェックで選びます。</p>
      </div>

      <div className={step}>
        <p className={stepTitle}>② 文章はどうしますか</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => setTextMode("auto")} className={chip(textMode === "auto")}>おまかせ(AIが書く)</button>
          <button type="button" disabled={busy} onClick={() => setTextMode("manual")} className={chip(textMode === "manual")}>自分で書く</button>
        </div>
        {textMode === "auto" ? (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">読者
              <select value={isShopMedia && audience === "auto" ? "public" : audience} onChange={(e) => setAudience(e.target.value)} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900">
                <option value="public">{isShopMedia ? "一般(ユーザー)向け(その店の紹介)" : "一般(ユーザー)向け"}</option>
                <option value="shop">{isShopMedia ? "店舗向け(その店を例に、仕様を説明)" : "店舗向け"}</option>
                {!isShopMedia && <option value="auto">おまかせ(交互)</option>}
              </select>
            </label>
            {isShopMedia && <p className="text-xs text-slate-600">店舗の写真・動画を使うときも、読者に合わせてAIが文章を書きます。店舗向けは、その店を掲載の一例として、オーナーに向けて仕様を説明します。</p>}
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} disabled={busy} placeholder="今回だけの一言(任意)例: 雨の日の話にして / もっと短く" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
          </div>
        ) : (
          <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} rows={5} maxLength={2200} placeholder="投稿する文章(Threadsは500文字、Instagramは2200文字まで)" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        )}
      </div>

      <div className={step}>
        <p className={stepTitle}>③ 画像・動画はどうしますか</p>
        <p className="text-xs text-slate-600">写真は動画にしません。写真ならInstagramのフィードとThreads、動画ならInstagramのリールとThreadsに出せます。</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {MEDIA_OPTIONS.map((m) => (
            <button key={m} type="button" disabled={busy} onClick={() => setMedia(m)} className={chip(media === m)}>
              <span className="block font-semibold">{MEDIA_LABEL[m].title}</span><span className="block text-xs opacity-80">{MEDIA_LABEL[m].hint}</span>
            </button>
          ))}
        </div>
        {media === "reel-ai" && (
          <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">画像の種類
            <select value={style === "flyer" ? "photo" : style} onChange={(e) => setStyle(e.target.value as "photo" | "illustration")} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900">
              <option value="photo">写真風</option><option value="illustration">イラスト</option>
            </select>
          </label>
        )}
        {media === "ai-image" && (
          <div className="space-y-2">
            <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">画像の種類
              <select value={style} onChange={(e) => setStyle(e.target.value as "photo" | "illustration" | "flyer")} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900">
                <option value="photo">写真風</option><option value="illustration">イラスト</option><option value="flyer">イラストのチラシ(見出しの文字入り)</option>
              </select>
            </label>
            {style === "flyer" && (
              <div className="space-y-1">
                <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={20} disabled={busy} placeholder="チラシの見出しの文字(20文字まで・空なら、サービス名)" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                <p className="text-[11px] text-slate-500">AIは文字なしのイラストだけを作り、見出しは正しい日本語のフォントで重ねます(文字は崩れません)。長い見出しは、自動で2行になります。</p>
              </div>
            )}
          </div>
        )}
        {media === "reel-upload-photo" && <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="text-xs text-slate-700" />}
        {media === "upload" && (
          // 標準の <label> + <input type=file> にする(タップ・クリックで確実に選択画面が開く。ドロップも受け付ける)。
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!busy) takeFile(e.dataTransfer.files?.[0]); }}
            className={`relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm focus-within:ring-2 focus-within:ring-slate-400 ${dragOver ? "border-slate-900 bg-slate-100" : "border-slate-300 bg-white"}`}
          >
            <input ref={pickRef} type="file" accept="image/*,video/*" disabled={busy} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ""; }} />
            {picked && previewUrl ? (
              <>
                {pickedIsVideo
                  ? <video src={previewUrl} muted playsInline className="pointer-events-none max-h-40 rounded border border-slate-200 bg-black" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={previewUrl} alt="" className="pointer-events-none max-h-40 rounded border border-slate-200" />}
                <span className="pointer-events-none text-xs text-slate-700">{picked.name}({pickedIsVideo ? "動画" : "写真"}・{(picked.size / 1024 / 1024).toFixed(1)}MB)</span>
                <span className="pointer-events-none text-[11px] text-slate-500">別のファイルは、ここにドロップするか、タップして選び直せます</span>
              </>
            ) : (
              <>
                <span className="pointer-events-none font-semibold text-slate-800">ここをタップして、写真か動画を選ぶ</span>
                <span className="pointer-events-none text-xs text-slate-500">パソコンでは、ここにドロップもできます ・ 写真はJPEG・PNG・WebP(3MBまで)、動画はMP4・MOV(200MBまで)</span>
              </>
            )}
            {notice && !notice.ok && <span className="pointer-events-none text-xs font-semibold text-red-700">{notice.message}</span>}
          </label>
        )}
      </div>

      <div className={step}>
        <p className={stepTitle}>④ 下書きを作る(まだ公開されません)</p>
        <p className="text-xs text-slate-600">作ると、下の「下書き」に入ります。そこで内容を確認し、投稿先(Instagram・Threads)にチェックを入れて、「今すぐ投稿」か「この日時に予約」を押すと公開されます。</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={submit} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">下書きを作る</button>
          {busy && <span role="status" className="text-sm font-semibold text-amber-700">{stage ? `${stage}${progress !== null && progress > 0 && progress < 100 ? ` ${progress}%` : ""}` : progress !== null ? `アップロード中…${progress}%` : "作っています…(AIの画像は最大1分ほど)"}</span>}
        </div>
        {notice && <p role="status" className={`whitespace-pre-wrap text-sm font-semibold ${notice.ok ? "text-emerald-700" : "text-red-700"}`}>{notice.message}</p>}
      </div>
    </div>
  );
}

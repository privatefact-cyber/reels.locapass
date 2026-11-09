"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { composeFlyerJpeg } from "@/lib/social/composeFlyer";
import { imageToReelFile } from "@/lib/social/imageToReel";

type Result = { ok: boolean; message: string };
type Sns = "instagram" | "threads";
type Form = "feed" | "reel" | "story" | "post";
type MediaKind = "none" | "shop-photo" | "shop-video" | "ai-image" | "upload-photo" | "upload-video" | "reel-ai" | "reel-shop-photo" | "reel-upload-photo";

const MEDIA_LABEL: Record<MediaKind, { title: string; hint: string; soon?: boolean }> = {
  "shop-photo": { title: "掲載店舗の写真(自動で選ぶ)", hint: "店名・リンク・お店のタグつきの定型文" },
  "shop-video": { title: "掲載店舗の動画(自動で選ぶ)", hint: "自前のサーバーにある動画だけ。店名・リンク・タグつき" },
  "ai-image": { title: "AIで画像を作る", hint: "街の雰囲気の画像を、AIが作ります" },
  "upload-photo": { title: "自分の写真をアップロード", hint: "JPEG・PNG・WebP、3MBまで" },
  "upload-video": { title: "自分の動画をアップロード", hint: "MP4・MOV、200MBまで。縦長(9:16)が基本" },
  none: { title: "画像・動画なし(文章だけ)", hint: "Threadsだけ" },
  "reel-ai": { title: "AIで画像を作って、動画にする", hint: "写真風またはイラストの画像を、約6秒の動画にします" },
  "reel-shop-photo": { title: "掲載店舗の写真を、動画にする(自動で選ぶ)", hint: "店名・リンク・タグつきの定型文" },
  "reel-upload-photo": { title: "自分の写真を、動画にする", hint: "JPEG・PNG・WebP、3MBまで" },
};

const FORMS: Record<Sns, { value: Form; title: string; hint: string; soon?: boolean }[]> = {
  instagram: [
    { value: "feed", title: "フィード(写真)", hint: "プロフィールに残る普通の投稿" },
    { value: "reel", title: "リール(縦動画)", hint: "新しい人に見つけてもらいやすい" },
    { value: "story", title: "ストーリーズ", hint: "準備中(まだ使えません)", soon: true },
  ],
  threads: [{ value: "post", title: "投稿", hint: "文章・写真・動画" }],
};

function mediaOptionsFor(sns: Sns, form: Form): MediaKind[] {
  if (sns === "threads") return ["none", "shop-photo", "ai-image", "upload-photo", "shop-video", "upload-video"];
  if (form === "feed") return ["shop-photo", "ai-image", "upload-photo"];
  if (form === "reel") return ["shop-video", "upload-video", "reel-ai", "reel-shop-photo", "reel-upload-photo"];
  return [];
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
  const [sns, setSns] = useState<Sns>("instagram");
  const [form, setForm] = useState<Form>("reel");
  const [textMode, setTextMode] = useState<"auto" | "manual">("auto");
  const [audience, setAudience] = useState("public");
  const [note, setNote] = useState("");
  const [body, setBody] = useState("");
  const [style, setStyle] = useState<"photo" | "illustration" | "flyer">("photo");
  const [headline, setHeadline] = useState("");
  const [media, setMedia] = useState<MediaKind>("shop-video");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState("");
  const [notice, setNotice] = useState<Result | null>(null);

  const options = mediaOptionsFor(sns, form);
  const pickSns = (next: Sns) => {
    setSns(next);
    const nextForm: Form = next === "threads" ? "post" : "reel";
    setForm(nextForm);
    setMedia(next === "threads" ? "none" : "shop-video");
  };
  const pickForm = (next: Form) => {
    setForm(next);
    setMedia(mediaOptionsFor(sns, next).find((m) => !MEDIA_LABEL[m].soon) ?? "none");
  };

  const isShopMedia = media === "shop-photo" || media === "shop-video" || media === "reel-shop-photo";
  const unavailable = form === "story";

  const submit = async () => {
    setNotice(null);
    if (unavailable) { setNotice({ ok: false, message: "この組み合わせは、まだ使えません" }); return; }
    if (textMode === "manual" && !body.trim()) { setNotice({ ok: false, message: "投稿の文章を入力してください" }); return; }
    const fd = new FormData();
    fd.set("dest", `${sns}:${account}`);
    fd.set("form", form);
    fd.set("textMode", textMode);
    fd.set("audience", audience);
    fd.set("note", note);
    fd.set("body", body);
    fd.set("mediaKind", media);
    fd.set("style", style);
    fd.set("headline", headline);
    setBusy(true); setProgress(null);
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
        const saved = await reelSave({ dest: `${sns}:${account}`, videoUrl: publicUrl, body: prepared.body, topicId: prepared.topicId, source: prepared.source ?? "manual" });
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
      if (media === "upload-photo") {
        const file = photoRef.current?.files?.[0];
        if (!file) throw new Error("写真を選んでください");
        fd.set("photo", file);
      }
      if (media === "upload-video") {
        const file = videoRef.current?.files?.[0];
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
      if (result.ok) { setBody(""); setNote(""); }
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
        <p className={stepTitle}>① どこに出しますか</p>
        <div className="flex flex-wrap gap-2">
          {(["locapass", "luxela"] as const).map((a) => <button key={a} type="button" disabled={busy} onClick={() => setAccount(a)} className={chip(account === a)}>{a === "locapass" ? "LOCAPASS" : "LUXELA"}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["instagram", "threads"] as const).map((s) => <button key={s} type="button" disabled={busy} onClick={() => pickSns(s)} className={chip(sns === s)}>{s === "instagram" ? "Instagram" : "Threads"}</button>)}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {FORMS[sns].map((f) => (
            <button key={f.value} type="button" disabled={busy || f.soon} onClick={() => pickForm(f.value)} className={chip(form === f.value, f.soon)}>
              <span className="block font-semibold">{f.title}</span><span className="block text-xs opacity-80">{f.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={step}>
        <p className={stepTitle}>② 文章はどうしますか</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => setTextMode("auto")} className={chip(textMode === "auto")}>おまかせ(AIが書く)</button>
          <button type="button" disabled={busy} onClick={() => setTextMode("manual")} className={chip(textMode === "manual")}>自分で書く</button>
        </div>
        {textMode === "auto" ? (
          isShopMedia ? (
            <p className="text-xs text-slate-600">店舗の写真・動画を使うときは、文章は定型(店名・リンク・お店のタグ)になります。AIの文章にはなりません。</p>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-600">読者
                <select value={audience} onChange={(e) => setAudience(e.target.value)} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900">
                  <option value="public">一般(ユーザー)向け</option><option value="shop">店舗向け</option><option value="auto">おまかせ(交互)</option>
                </select>
              </label>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} disabled={busy} placeholder="今回だけの一言(任意)例: 雨の日の話にして / もっと短く" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
            </div>
          )
        ) : (
          <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} rows={5} maxLength={2200} placeholder="投稿する文章(Instagramは2200文字、Threadsは500文字まで)" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        )}
      </div>

      <div className={step}>
        <p className={stepTitle}>③ 画像・動画はどうしますか</p>
        {options.length === 0 ? <p className="text-xs text-slate-500">ストーリーズは準備中です。</p> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((m) => (
              <button key={m} type="button" disabled={busy || MEDIA_LABEL[m].soon} onClick={() => setMedia(m)} className={chip(media === m, MEDIA_LABEL[m].soon)}>
                <span className="block font-semibold">{MEDIA_LABEL[m].title}</span><span className="block text-xs opacity-80">{MEDIA_LABEL[m].hint}</span>
              </button>
            ))}
          </div>
        )}
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
        {(media === "upload-photo" || media === "reel-upload-photo") && <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="text-xs text-slate-700" />}
        {media === "upload-video" && <input ref={videoRef} type="file" accept="video/mp4,video/quicktime" disabled={busy} className="text-xs text-slate-700" />}
      </div>

      <div className={step}>
        <p className={stepTitle}>④ 下書きを作る(まだ公開されません)</p>
        <p className="text-xs text-slate-600">作ると、下の「下書き」に入ります。そこで内容を確認して、「今すぐ投稿」か「この日時に予約」を押すと公開されます。</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy || unavailable} onClick={submit} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">下書きを作る</button>
          {busy && <span role="status" className="text-sm font-semibold text-amber-700">{stage ? `${stage}${progress !== null && progress > 0 && progress < 100 ? ` ${progress}%` : ""}` : progress !== null ? `アップロード中…${progress}%` : "作っています…(AIの画像は最大1分ほど)"}</span>}
        </div>
        {notice && <p role="status" className={`whitespace-pre-wrap text-sm font-semibold ${notice.ok ? "text-emerald-700" : "text-red-700"}`}>{notice.message}</p>}
      </div>
    </div>
  );
}

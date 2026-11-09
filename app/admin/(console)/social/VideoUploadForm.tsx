"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Result = { ok: boolean; message: string };

/** 動画を選んで、ブラウザからR2へ直接アップロードし、その動画で下書き(リール/動画つき投稿)を作る。 */
export function VideoUploadForm({ action }: { action: (dest: string, videoUrl: string, text: string) => Promise<Result> }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dest, setDest] = useState("instagram:locapass");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<Result | null>(null);

  const submit = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setNotice({ ok: false, message: "動画を選んでください" }); return; }
    if (!["video/mp4", "video/quicktime"].includes(file.type)) { setNotice({ ok: false, message: "MP4またはMOVの動画を選んでください" }); return; }
    if (file.size > 200 * 1024 * 1024) { setNotice({ ok: false, message: "動画は200MB以下にしてください" }); return; }
    if (!text.trim()) { setNotice({ ok: false, message: "投稿の文章を入力してください" }); return; }
    setBusy(true); setNotice(null); setProgress(0);
    try {
      const created = await fetch("/api/r2/presigned-upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: "social_admin", contentType: file.type, size: file.size }),
      });
      if (!created.ok) throw new Error(((await created.json().catch(() => ({}))) as { error?: string }).error ?? "アップロードの準備に失敗しました");
      const { uploadURL, publicUrl } = (await created.json()) as { uploadURL: string; publicUrl: string };
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadURL);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`アップロードに失敗しました(${xhr.status})`)));
        xhr.onerror = () => reject(new Error("通信に失敗しました"));
        xhr.send(file);
      });
      const result = await action(dest, publicUrl, text);
      setNotice(result);
      if (result.ok) { setText(""); if (fileRef.current) fileRef.current.value = ""; }
      router.refresh();
    } catch (e) {
      setNotice({ ok: false, message: e instanceof Error ? e.message : "失敗しました" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <select value={dest} onChange={(e) => setDest(e.target.value)} disabled={busy} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
        <option value="instagram:locapass">Instagram LOCAPASS(リール)</option>
        <option value="instagram:luxela">Instagram LUXELA(リール)</option>
        <option value="threads:locapass">Threads LOCAPASS(動画)</option>
        <option value="threads:luxela">Threads LUXELA(動画)</option>
      </select>
      <input ref={fileRef} type="file" accept="video/mp4,video/quicktime" disabled={busy} className="text-xs text-slate-700" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={busy} rows={5} maxLength={2200} placeholder="投稿の文章(Instagramは2200文字、Threadsは500文字まで)" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={submit} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">動画をアップロードして下書きを作る</button>
        {busy && <span role="status" className="text-sm font-semibold text-amber-700">アップロード中…{progress}%(閉じずに待ってください)</span>}
      </div>
      {notice && <p role="status" className={`text-sm font-semibold ${notice.ok ? "text-emerald-700" : "text-red-700"}`}>{notice.message}</p>}
      <p className="text-[11px] text-slate-500">MP4/MOV・200MBまで。縦長(9:16)が基本です。使ってよいのは、自分たちが権利を持つ動画、または掲載店舗の許諾がある動画だけです。</p>
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MURMUR_BUCKET, MURMUR_MAX_LENGTH } from "@/lib/murmur/config";
import { postMurmur, prepareMurmurImageUpload } from "./actions";

/** 写真を長辺1600pxのJPEGに縮める(スマホの大きな写真でも、通信量とアップロード時間を抑える)。 */
export async function downscale(file: File, maxEdge = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** スマホで、文字を打って「投稿」を押すだけの入力欄。写真は1枚まで(任意)。 */
export function MurmurComposer({ shopId }: { shopId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const length = [...text].length;
  const over = length > MURMUR_MAX_LENGTH;

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage({ kind: "error", text: "写真を選んでください" });
      return;
    }
    const blob = await downscale(file);
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto({ blob, preview: URL.createObjectURL(blob) });
    setMessage(null);
  }

  function clearPhoto() {
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      let imagePath: string | null = null;
      if (photo) {
        const prepared = await prepareMurmurImageUpload(shopId);
        if (!prepared.ok) return setMessage({ kind: "error", text: prepared.error });
        const { error } = await createClient()
          .storage.from(MURMUR_BUCKET)
          .uploadToSignedUrl(prepared.path, prepared.token, photo.blob, { contentType: "image/jpeg" });
        if (error) return setMessage({ kind: "error", text: "写真を送れませんでした。電波の良い場所でもう一度お試しください" });
        imagePath = prepared.path;
      }
      const result = await postMurmur(shopId, text, imagePath);
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setText("");
      clearPhoto();
      setMessage({ kind: "ok", text: "投稿しました" });
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label htmlFor="murmur-text" className="sr-only">VOICE</label>
      <textarea
        id="murmur-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="いまの声(VOICE)を、気軽に書いてください"
        disabled={pending}
        // 16px未満だと、iPhoneでタップしたときに画面が拡大されてしまう。
        className="w-full resize-none rounded-xl border border-slate-300 p-3 text-base text-slate-900 focus:border-slate-900 focus:outline-none disabled:bg-slate-100"
      />
      {photo && (
        <div className="relative mt-3 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.preview} alt="" className="max-h-48 rounded-xl border border-slate-200 object-cover" />
          <button
            type="button"
            onClick={clearPhoto}
            aria-label="写真を外す"
            className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm text-white shadow"
          >
            ✕
          </button>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="flex h-12 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-50"
        >
          <ImagePlus size={18} strokeWidth={1.75} /> {photo ? "写真を変える" : "写真をつける"}
        </button>
        <span className={`ml-auto text-sm tabular-nums ${over ? "font-bold text-red-600" : "text-slate-400"}`}>
          {length}/{MURMUR_MAX_LENGTH}
        </span>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending || over || length === 0}
        className="mt-3 h-14 w-full rounded-xl bg-slate-900 text-base font-bold text-white active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {pending ? "送信中…" : "投稿!"}
      </button>
      {message && (
        <p className={`mt-3 rounded-lg p-2 text-sm ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
      )}
    </div>
  );
}

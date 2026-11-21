"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MURMUR_BUCKET, MURMUR_MAX_LENGTH } from "@/lib/murmur/config";
import { postMurmur, prepareMurmurImageUpload } from "@/app/dashboard/shop/[shopId]/murmurs/actions";
import { downscale } from "@/app/dashboard/shop/[shopId]/murmurs/MurmurComposer";
import type { ComposerShop } from "@/lib/murmur/composerShops";

/**
 * タイムラインの一番上に置く、投稿欄(Threads・Xのように、一覧とつながった見た目)。
 * ログイン中の店舗アカウントに紐づけて、その場で投稿できる。担当の店が複数あるときは、投稿するお店を選ぶ。
 */
export function TimelineComposer({ shops }: { shops: ComposerShop[] }) {
  const router = useRouter();
  const [shopId, setShopId] = useState(shops[0]?.id ?? "");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const shop = shops.find((s) => s.id === shopId) ?? shops[0];
  const length = [...text].length;
  const over = length > MURMUR_MAX_LENGTH;
  if (!shop) return null;

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMessage({ kind: "error", text: "写真を選んでください" });
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
        const prepared = await prepareMurmurImageUpload(shop.id);
        if (!prepared.ok) return setMessage({ kind: "error", text: prepared.error });
        const { error } = await createClient().storage.from(MURMUR_BUCKET).uploadToSignedUrl(prepared.path, prepared.token, photo.blob, { contentType: "image/jpeg" });
        if (error) return setMessage({ kind: "error", text: "写真を送れませんでした。電波の良い場所でもう一度お試しください" });
        imagePath = prepared.path;
      }
      const result = await postMurmur(shop.id, text, imagePath);
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setText("");
      clearPhoto();
      setMessage({ kind: "ok", text: "投稿しました" });
      router.refresh();
    });
  }

  return (
    <div className="flex gap-3 border-b border-tone-700/60 px-1 py-4">
      {shop.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shop.iconUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tone-800 text-sm font-semibold text-tone-400">{shop.name.slice(0, 1)}</span>
      )}
      <div className="min-w-0 flex-1">
        {shops.length > 1 ? (
          <select value={shopId} onChange={(e) => setShopId(e.target.value)} disabled={pending} aria-label="投稿するお店" className="mb-1 max-w-full rounded-md border border-tone-700/60 bg-transparent px-2 py-1 text-sm font-semibold text-main">
            {shops.map((s) => (
              <option key={s.id} value={s.id} className="text-slate-900">
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm font-semibold text-main"><bdi>{shop.name}</bdi></p>
        )}
        <label htmlFor="timeline-murmur" className="sr-only">VOICE</label>
        <textarea
          id="timeline-murmur"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="いまの声(VOICE)を、気軽に書いてください"
          disabled={pending}
          // 16px未満だと、iPhoneでタップしたときに画面が拡大されてしまう。
          className="w-full resize-none bg-transparent text-base leading-relaxed text-main placeholder:text-tone-500 focus:outline-none disabled:opacity-60"
        />
        {photo && (
          <div className="relative mt-1 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.preview} alt="" className="max-h-48 rounded-xl object-cover" />
            <button type="button" onClick={clearPhoto} aria-label="写真を外す" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-xs text-white">
              ✕
            </button>
          </div>
        )}
        <div className="mt-2 flex items-center gap-3">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={pending} aria-label="写真をつける" className="text-xl leading-none disabled:opacity-50">
            📷
          </button>
          <span className={`ml-auto text-xs tabular-nums ${over ? "font-bold text-red-500" : "text-tone-400"}`}>
            {length}/{MURMUR_MAX_LENGTH}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={pending || over || length === 0}
            className="rounded-full bg-hl-400 px-5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "送信中…" : "投稿"}
          </button>
        </div>
        {message && <p className={`mt-2 text-xs ${message.kind === "ok" ? "text-emerald-500" : "text-red-500"}`}>{message.text}</p>}
      </div>
    </div>
  );
}

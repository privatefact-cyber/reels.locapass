"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MURMUR_BUCKET, MURMUR_MAX_LENGTH } from "@/lib/murmur/config";
import { postMurmur, prepareMurmurImageUpload } from "@/app/dashboard/shop/[shopId]/murmurs/actions";
import { downscale } from "@/app/dashboard/shop/[shopId]/murmurs/MurmurComposer";
import type { ComposerShop } from "@/lib/murmur/composerShops";

/**
 * タイムラインの下に浮かぶ「+」ボタンと、押すと開く投稿画面(モーダル)。一覧の上に入力欄を置かないので、タイムラインが見やすい。
 * ログイン中の店舗アカウントに紐づけて、その場で投稿できる。担当の店が複数あるときは、投稿するお店を選ぶ。
 */
export function TimelineComposer({ shops }: { shops: ComposerShop[] }) {
  const router = useRouter();
  const [shopId, setShopId] = useState(shops[0]?.id ?? "");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const shop = shops.find((s) => s.id === shopId) ?? shops[0];
  const length = [...text].length;
  const over = length > MURMUR_MAX_LENGTH;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !pending && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);
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
      setMessage(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="VOICEを投稿する"
        className="fixed left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-hl-400 text-white shadow-lg shadow-black/30 active:scale-95 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-8"
      >
        <Plus size={28} strokeWidth={2} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="VOICEを投稿する">
          <button type="button" aria-label="閉じる" onClick={() => !pending && setOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-t-3xl border border-main/10 bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <button type="button" onClick={() => setOpen(false)} disabled={pending} aria-label="閉じる" className="flex h-8 w-8 items-center justify-center rounded-full border border-main/15 text-muted hover:text-main">
                <X size={16} />
              </button>
              <span className="text-sm font-bold tracking-wide text-main">VOICE</span>
              <button
                type="button"
                onClick={submit}
                disabled={pending || over || length === 0}
                className="rounded-full bg-hl-400 px-5 py-1.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? "送信中…" : "投稿"}
              </button>
            </div>
            <div className="flex gap-3">
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
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  placeholder="ふらっとつぶやこう"
                  disabled={pending}
                  // 16px未満だと、iPhoneでタップしたときに画面が拡大されてしまう。
                  className="w-full resize-none bg-transparent text-base leading-relaxed text-main placeholder:text-tone-500 focus:outline-none disabled:opacity-60"
                />
                {photo && (
                  <div className="relative mt-1 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.preview} alt="" className="max-h-48 rounded-xl object-cover" />
                    <button type="button" onClick={clearPhoto} aria-label="写真を外す" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white">
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div className="mt-2 flex items-center gap-3">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={pending} aria-label="写真をつける" className="text-tone-300 hover:text-main disabled:opacity-50">
                    <ImagePlus size={22} strokeWidth={1.75} />
                  </button>
                  <span className={`ml-auto text-xs tabular-nums ${over ? "font-bold text-red-500" : "text-tone-400"}`}>
                    {length}/{MURMUR_MAX_LENGTH}
                  </span>
                </div>
                {message && <p className={`mt-2 text-xs ${message.kind === "ok" ? "text-emerald-500" : "text-red-500"}`}>{message.text}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

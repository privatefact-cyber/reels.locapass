"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addGalleryImage, deleteGalleryImage, reorderGalleryImages } from "@/app/dashboard/shop/[shopId]/actions";

const MAX_IMAGES = 10;

async function uploadFile(shopId: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${shopId}/gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from("locapass-reels").upload(path, file, {
    contentType: file.type,
  });
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);

  const { data } = supabase.storage.from("locapass-reels").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * 店舗紹介ページ用の写真ギャラリー(最大10枚)。ドラッグ&ドロップで複数枚まとめて追加でき、
 * 各写真はキャスト管理の写真一覧と同じ「サムネイル+削除ボタン」のグリッドで表示する。
 */
export function ShopGalleryUploader({ shopId, initialUrls }: { shopId: string; initialUrls: string[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const remainingSlots = MAX_IMAGES - urls.length;

  async function handleFiles(files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, Math.max(0, remainingSlots));
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of list) {
        const url = await uploadFile(shopId, file);
        await addGalleryImage(shopId, url);
        setUrls((prev) => [...prev, url]);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  /** from番目の写真を to番目へ移す。画面はすぐ入れ替え、保存に失敗したら元の並びに戻す。 */
  async function handleMove(from: number, to: number) {
    if (from === to || to < 0 || to >= urls.length) return;
    const previous = urls;
    const next = [...urls];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setUrls(next);
    setError(null);
    try {
      await reorderGalleryImages(shopId, next);
      router.refresh();
    } catch (err) {
      setUrls(previous);
      setError(err instanceof Error ? err.message : "並び替えに失敗しました");
    }
  }

  async function handleDelete(url: string) {
    setDeletingUrl(url);
    setError(null);
    try {
      await deleteGalleryImage(shopId, url);
      setUrls((prev) => prev.filter((u) => u !== url));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setDeletingUrl(null);
    }
  }

  return (
    <div>
      {urls.length > 1 && <p className="mb-2 text-[11px] text-slate-500">写真をドラッグして並び替えできます(スマホは ◀ ▶ で入れ替え)。1枚目が最初に表示されます。</p>}
      <div className="mb-3 flex flex-wrap gap-3">
        {urls.map((url, index) => (
          <div
            key={url}
            // PCはドラッグで入れ替え。スマホなどドラッグできない端末は、下の ◀ ▶ ボタンで入れ替える。
            draggable
            onDragStart={(e) => {
              setDragIndex(index);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              setOverIndex(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null) void handleMove(dragIndex, index);
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            className={`relative cursor-grab rounded transition ${dragIndex === index ? "opacity-40" : ""} ${
              overIndex === index && dragIndex !== null && dragIndex !== index ? "ring-2 ring-sky-500" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" draggable={false} className="h-32 w-24 rounded object-cover" />
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] font-bold text-white">{index + 1}</span>
            <div className="mt-1 flex gap-1">
              <button
                type="button"
                aria-label="前へ"
                disabled={index === 0}
                onClick={() => void handleMove(index, index - 1)}
                className="flex-1 rounded bg-slate-50 py-0.5 text-xs text-slate-600 hover:bg-slate-200 disabled:opacity-30"
              >
                ◀
              </button>
              <button
                type="button"
                aria-label="後ろへ"
                disabled={index === urls.length - 1}
                onClick={() => void handleMove(index, index + 1)}
                className="flex-1 rounded bg-slate-50 py-0.5 text-xs text-slate-600 hover:bg-slate-200 disabled:opacity-30"
              >
                ▶
              </button>
            </div>
            <button
              type="button"
              disabled={deletingUrl === url}
              onClick={() => handleDelete(url)}
              className="mt-1 w-full rounded bg-slate-50 px-1 py-0.5 text-xs text-slate-600 hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
            >
              {deletingUrl === url ? "削除中..." : "削除"}
            </button>
          </div>
        ))}
      </div>

      {remainingSlots > 0 ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFiles(e.dataTransfer.files);
          }}
          className={`flex h-24 w-full max-w-xs cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed text-center text-xs transition ${
            dragOver ? "border-brand bg-brand/5" : "border-slate-300 bg-white"
          }`}
        >
          <span className="px-2 text-slate-400">
            {uploading
              ? "アップロード中..."
              : `写真をドラッグ&ドロップ、またはタップして選択(あと${remainingSlots}枚)`}
          </span>
        </div>
      ) : (
        <p className="text-xs text-slate-400">最大{MAX_IMAGES}枚まで登録済みです。追加するには先に削除してください。</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addGalleryImage, deleteGalleryImage } from "@/app/admin/locapass-shops/[shopId]/actions";

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
      <div className="mb-3 flex flex-wrap gap-3">
        {urls.map((url) => (
          <div key={url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-32 w-24 rounded object-cover" />
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

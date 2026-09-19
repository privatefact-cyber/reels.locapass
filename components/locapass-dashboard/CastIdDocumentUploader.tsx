"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setIdDocument, deleteIdDocument } from "@/app/dashboard/shop/[shopId]/cast/actions";

export function CastIdDocumentUploader({
  shopId,
  castId,
  hasDocument,
}: {
  shopId: string;
  castId: string;
  hasDocument: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);

    const supabase = createClient();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${castId}/id-document.${ext}`;

    const { error: uploadError } = await supabase.storage.from("locapass-id-documents").upload(path, file, {
      contentType: file.type,
      upsert: true,
    });

    if (uploadError) {
      setUploading(false);
      setError(`アップロードに失敗しました: ${uploadError.message}`);
      return;
    }

    try {
      await setIdDocument(shopId, castId, path);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    setUploading(true);
    setError(null);
    try {
      await deleteIdDocument(shopId, castId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {uploading ? "処理中..." : hasDocument ? "画像を差し替え" : "身分証画像を保存"}
        </button>
        {hasDocument && (
          <button
            type="button"
            disabled={uploading}
            onClick={handleDelete}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            削除
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

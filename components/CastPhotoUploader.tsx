"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addPhoto } from "@/app/dashboard/cast/actions";

export function CastPhotoUploader({ castId, shopId }: { castId: string; shopId: string }) {
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
    const path = `${castId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from("cast-media").upload(path, file, {
      contentType: file.type,
    });

    if (uploadError) {
      setUploading(false);
      setError(`アップロードに失敗しました: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("cast-media").getPublicUrl(path);

    const formData = new FormData();
    formData.set("url", publicUrlData.publicUrl);
    try {
      await addPhoto(castId, shopId, formData);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像の登録に失敗しました");
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
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
        className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {uploading ? "アップロード中..." : "画像を追加"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

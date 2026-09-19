"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { validateReelFile, optimizeReelVideo } from "@/lib/reels/prepareReelFile";

export function ShopReelPostForm({ shopId, portalId }: { shopId: string; portalId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }

    const validationError = await validateReelFile(f);
    if (validationError) {
      setError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));

    if (f.type.startsWith("video/")) {
      setOptimizing(true);
      const optimized = await optimizeReelVideo(f);
      setOptimizing(false);
      setFile(optimized);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(optimized);
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("写真か動画を選んでください");
      return;
    }
    setUploading(true);
    setError(null);

    const supabase = createClient();
    const isVideo = file.type.startsWith("video/");
    const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
    const path = `${shopId}/${Date.now()}.${ext}`;

    // locapassのリールはlocapass-reelsバケット(shop_id配下)に置き、locapass_reelsへ登録する。
    // マップのカード用軽量プレビュー(本家のpreview_url)はlocapass_reelsに受け皿の列が無いため作らない。
    const { error: uploadError } = await supabase.storage
      .from("locapass-reels")
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setUploading(false);
      setError(`アップロードに失敗しました: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("locapass-reels").getPublicUrl(path);

    const { error: insertError } = await supabase.from("locapass_reels").insert({
      shop_id: shopId,
      // portal_idはDBトリガーが店舗から強制上書きするが、型上必須なので店舗のportal_idを渡す。
      portal_id: portalId,
      caption: caption.trim() || null,
      action_url: linkUrl.trim() || null,
      video_url: isVideo ? publicUrlData.publicUrl : null,
      images: isVideo ? [] : [{ url: publicUrlData.publicUrl }],
      reel_type: "permanent",
      status: "publish",
    });

    setUploading(false);

    if (insertError) {
      setError(`投稿の保存に失敗しました: ${insertError.message}`);
      return;
    }

    setFile(null);
    setPreview(null);
    setCaption("");
    setLinkUrl("");
    setOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        リールを投稿する
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-brand">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleFileChange}
          className="hidden"
        />
        {preview ? (
          file?.type.startsWith("video/") ? (
            <video src={preview} className="mx-auto max-h-64 w-full rounded-lg object-cover" controls />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="mx-auto max-h-64 w-full rounded-lg object-cover" />
          )
        ) : (
          <span className="text-sm font-medium text-slate-600">写真・動画を選択</span>
        )}
      </label>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="ひとことコメントを入力"
        rows={2}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
      <div>
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="リンク先URL(任意)"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <p className="mt-1 text-[11px] text-slate-500">空欄なら店舗ページへのリンクになります。</p>
      </div>
      {optimizing && <p className="text-xs text-slate-500">動画をスマホ向けに最適化しています…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={uploading || optimizing}
          className="flex-1 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {uploading ? "投稿中..." : optimizing ? "最適化中..." : "投稿する"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setFile(null);
            setPreview(null);
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"
        >
          やめる
        </button>
      </div>
    </form>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { validateReelFile, optimizeReelVideo } from "@/lib/reels/prepareReelFile";
import { uploadReelPreview } from "@/lib/reels/uploadReelPreview";
import { generateTextCardImage, BIG_TEXT_MAX_LENGTH } from "@/lib/reels/generateTextCard";

/**
 * 店舗スタッフが特定キャストの代わりに投稿する「キャストリール」フォーム。
 * 写真/動画を選ばずテキストだけで投稿した場合は、黒背景+先頭40文字の大きな白文字で
 * 画像を自動生成して投稿する(本文全体はcaptionにそのまま保存され、フィード側で
 * 40文字を超える分は「続きを読む」から読める)。
 */
export function CastReelPostForm({ castId, shopId, portalId }: { castId: string; shopId: string; portalId: number }) {
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
    const trimmedCaption = caption.trim();

    if (!file && !trimmedCaption) {
      setError("写真・動画を選ぶか、テキストを入力してください");
      return;
    }

    setUploading(true);
    setError(null);

    const supabase = createClient();
    let isVideo = false;
    let uploadBlob: Blob = file ?? new Blob();
    let ext = "png";
    let contentType = "image/png";

    if (file) {
      isVideo = file.type.startsWith("video/");
      ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
      contentType = file.type;
      uploadBlob = file;
    } else {
      try {
        uploadBlob = await generateTextCardImage(trimmedCaption);
      } catch (genError) {
        setUploading(false);
        setError(genError instanceof Error ? genError.message : "画像の生成に失敗しました");
        return;
      }
    }

    // locapass では店舗フォルダ配下(locapass-reels バケット)に置き、cast_id 付きで locapass_reels に登録する。
    const path = `${shopId}/${Date.now()}.${ext}`;
    // 動画ならマップのカード用の軽量プレビューも並行して作る(失敗しても投稿は続ける)。
    const [{ error: uploadError }, previewUrl] = await Promise.all([
      supabase.storage.from("locapass-reels").upload(path, uploadBlob, { contentType: contentType }),
      isVideo && file ? uploadReelPreview(supabase, shopId, file) : Promise.resolve(null),
    ]);

    if (uploadError) {
      setUploading(false);
      setError(`アップロードに失敗しました: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("locapass-reels").getPublicUrl(path);

    const { error: insertError } = await supabase.from("locapass_reels").insert({
      cast_id: castId,
      shop_id: shopId,
      portal_id: portalId,
      caption: trimmedCaption || null,
      action_url: linkUrl.trim() || null,
      video_url: isVideo ? publicUrlData.publicUrl : null,
      images: isVideo ? [] : [{ url: publicUrlData.publicUrl }],
      reel_type: "permanent",
      status: "publish",
      preview_url: previewUrl,
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
        className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
      >
        キャストリールを投稿する
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-slate-500">
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
          <span className="text-sm font-medium text-slate-600">写真・動画を選択(任意)</span>
        )}
      </label>
      <div>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="コメント・本文を入力"
          rows={4}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <p className="mt-1 text-[11px] text-slate-500">
          {file
            ? "写真・動画付きの投稿ではコメントとしてそのまま表示されます。"
            : `画像を選ばない場合、先頭${BIG_TEXT_MAX_LENGTH}文字が黒背景の大きな文字で画像化されます。それ以降は「続きを読む」で表示されます(${caption.trim().length}文字)。`}
        </p>
      </div>
      <div>
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="リンク先URL(任意)"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <p className="mt-1 text-[11px] text-slate-500">空欄ならキャストのプロフィールページへのリンクになります。</p>
      </div>
      {optimizing && <p className="text-xs text-slate-500">動画をスマホ向けに最適化しています…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={uploading || optimizing}
          className="flex-1 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
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

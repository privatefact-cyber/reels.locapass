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
export function CastReelPostForm({ castId, shopId }: { castId: string; shopId: string }) {
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

    // 本家は reels テーブル(cast_id付き)+reelsバケットに保存する。locapass_reels にはキャスト本人の
    // 投稿を区別する列が無いため、店舗画面からのキャスト代理投稿は未接続。
    setError("この機能はまだlocapassのデータベースに接続されていません");
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

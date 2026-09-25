"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadToStream } from "@/lib/stream/uploadToStream";
import { streamPlaybackUrl } from "@/lib/stream/playback";
import { StreamVideo } from "@/components/video/StreamVideo";

async function uploadFile(shopId: string, file: File): Promise<string> {
  if (file.type.startsWith("video/")) {
    // 動画本体はブラウザからCloudflare StreamへTUS直送する。Supabase Storageは通さない。
    const uid = await uploadToStream(file);
    const playbackUrl = streamPlaybackUrl(uid);
    if (!playbackUrl) throw new Error("Cloudflare Stream の公開設定が不足しています");
    return playbackUrl;
  }

  const supabase = createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${shopId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from("locapass-reels").upload(path, file, {
    contentType: file.type,
  });
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);

  const { data } = supabase.storage.from("locapass-reels").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * 画像(単一、既定では動画も可)用のドラッグ&ドロップ/タップ選択アップローダー。
 * イベントサムネイルや店舗カバー画像・トップ画像など汎用的に使う。
 */
export function SingleImageDropzone({
  shopId,
  name,
  label,
  hint,
  defaultUrl,
  defaultType = "image",
  acceptVideo = false,
  onChange,
  boxClassName,
}: {
  shopId: string;
  name: string;
  label: string;
  /** ラベル下に小さく出す補足(推奨サイズ・アスペクト比など)。 */
  hint?: string;
  defaultUrl?: string | null;
  /** acceptVideo=trueのときの初期メディア種別(既存データの復元用)。 */
  defaultType?: "image" | "video";
  /** trueにすると動画ファイルも選択でき、種別を `${name}_type` という隠しinputで一緒に送信する。 */
  acceptVideo?: boolean;
  onChange?: (url: string | null) => void;
  /** ドロップ枠のサイズ・アスペクト比クラス。省略時は縦長サムネイル向けサイズ。 */
  boxClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrlState] = useState<string | null>(defaultUrl ?? null);
  const [mediaType, setMediaType] = useState<"image" | "video">(defaultType);
  const setUrl = (u: string | null) => {
    setUrlState(u);
    onChange?.(u);
  };
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const uploadedUrl = await uploadFile(shopId, file);
      setMediaType(file.type.startsWith("video/") ? "video" : "image");
      setUrl(uploadedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-black/50">{label}</label>
      {hint && <p className="mt-0.5 text-[11px] text-black/40">{hint}</p>}
      <input type="hidden" name={name} value={url ?? ""} />
      {acceptVideo && <input type="hidden" name={`${name}_type`} value={mediaType} />}
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
        className={`mt-1 flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded border-2 border-dashed text-center text-xs transition ${
          boxClassName ?? "h-40 w-28"
        } ${dragOver ? "border-brand bg-brand/5" : "border-black/20 bg-white"}`}
      >
        {url ? (
          mediaType === "video" ? (
            <StreamVideo src={url} muted playsInline autoPlay loop className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="プレビュー" className="h-full w-full object-cover" />
          )
        ) : uploading ? (
          <span className="text-black/40">アップロード中...</span>
        ) : (
          <span className="px-2 text-black/40">
            {acceptVideo ? "画像/動画" : "画像"}をドラッグ&ドロップ
            <br />
            またはタップして選択
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={acceptVideo ? "image/*,video/*" : "image/*"}
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {url && (
        <button
          type="button"
          onClick={() => setUrl(null)}
          className="mt-1 text-xs text-black/40 hover:text-red-600"
        >
          削除してやり直す
        </button>
      )}
    </div>
  );
}

/** 詳細ページ用の追加画像(複数・任意)アップローダー。 */
export function EventGalleryDropzone({
  shopId,
  name,
  initialUrls,
}: {
  shopId: string;
  name: string;
  initialUrls?: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>(initialUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await Promise.all(list.map((file) => uploadFile(shopId, file)));
      setUrls((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-black/50">
        詳細ページ用の追加画像(任意・複数選択可)
      </label>
      <input type="hidden" name={name} value={JSON.stringify(urls)} />
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
        className={`mt-1 flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed text-center text-xs transition ${
          dragOver ? "border-brand bg-brand/5" : "border-black/20 bg-white"
        }`}
      >
        <span className="px-2 text-black/40">
          {uploading ? "アップロード中..." : "画像をドラッグ&ドロップ、またはタップして選択(複数可)"}
        </span>
      </div>
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
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {urls.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {urls.map((u, i) => (
            <div key={u} className="relative h-16 w-16 overflow-hidden rounded border border-black/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setUrls((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center bg-black/60 text-[10px] text-main"
                aria-label="削除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

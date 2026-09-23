"use client";

/**
 * リール用の単一スレッド FFmpeg WASM トランスコーダ。
 * FFmpeg 自身が Worker 内で動作するため、エンコードで UI スレッドを塞がない。
 * iOS Safari のメモリ上限を考慮し、処理ごとに Worker と仮想FSを必ず破棄する。
 */
export const MAX_REEL_OUTPUT_BYTES = 15 * 1024 * 1024;
export const TRANSCODE_THRESHOLD_BYTES = 35 * 1024 * 1024;

type Progress = (percent: number) => void;

function inputExtension(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : "bin";
}

type TranscodeOptions = {
  /**
   * 35MB以下でも再エンコード無しの高速remuxでfaststartを保証する(オプトイン)。
   * キャスト本人のスマホ投稿(cast mypage)のみで使う想定。店舗管理画面側の
   * 投稿フォームは元々ほぼ瞬時に終わる体験だったため、デフォルトでは掛けない
   * (掛けるとFFmpeg WASMの読み込みが常に走り、体感が明確に遅くなるため)。
   */
  forceFaststartRemux?: boolean;
};

export async function transcodeReelVideo(
  file: File,
  onProgress?: Progress,
  options?: TranscodeOptions,
): Promise<File> {
  if (!file.type.startsWith("video/")) return file;
  if (file.size <= TRANSCODE_THRESHOLD_BYTES) {
    if (!options?.forceFaststartRemux) return file;
    // 失敗しても投稿自体は止めず、元ファイルのままフォールバックする。
    return remuxForFaststart(file).catch((cause) => {
      console.error("[reel-remux] faststart remux skipped; using original file", cause);
      return file;
    });
  }

  // 動的 import により、投稿画面を開かない閲覧者は FFmpeg を取得しない。
  let stage = "dynamic-import";
  try {
  const [{ FFmpeg }, { fetchFile }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);
  const ffmpeg = new FFmpeg();
  const input = `input.${inputExtension(file)}`;
  const output = "reel.mp4";
  const isPortrait = await isPortraitVideo(file);
  const target = isPortrait ? "1080:1920" : "1920:1080";
  const filter = isPortrait
    ? "fps=24,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
    : "fps=24,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080";

  const progress = ({ progress }: { progress: number }) => {
    // FFmpeg は mux 中に 1 を報告することがあるため、完了までは 99% に留める。
    onProgress?.(Math.max(1, Math.min(99, Math.round(progress * 100))));
  };

  ffmpeg.on("progress", progress);
  try {
    onProgress?.(1);
    // @ffmpeg/core は pthread を含まない単一スレッド版。COOP/COEP は不要。
    const baseUrl = window.location.origin;
    stage = "core-load";
    await ffmpeg.load({
      coreURL: `${baseUrl}/ffmpeg/ffmpeg-core.js`,
      wasmURL: `${baseUrl}/ffmpeg/ffmpeg-core.wasm`,
    });
    stage = "input-buffer";
    const inputBytes = await fetchFile(file);
    await ffmpeg.writeFile(input, inputBytes);
    stage = "encode";
    const result = await ffmpeg.exec([
      "-i", input,
      "-t", "30.5",
      "-vf", filter,
      "-r", "24",
      "-c:v", "libx264",
      "-profile:v", "main",
      "-pix_fmt", "yuv420p",
      "-b:v", "3200k",
      "-maxrate", "3500k",
      "-bufsize", "7000k",
      "-preset", "veryfast",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ac", "2",
      "-ar", "48000",
      "-movflags", "+faststart",
      output,
    ], 300_000);
    if (result !== 0) throw new Error("動画の変換に失敗しました");
    stage = "output-read";
    const data = await ffmpeg.readFile(output);
    // FFmpegの返り値はArrayBufferLikeを持つ型。コピーして通常のArrayBufferへ
    // 正規化し、SafariとNext.jsの型検査の両方で安全にBlob化する。
    const bytes = new Uint8Array(data as Uint8Array);
    const blob = new Blob([bytes.buffer], { type: "video/mp4" });
    if (blob.size > MAX_REEL_OUTPUT_BYTES) {
      throw new Error("変換後の動画が15MBを超えました。短い動画にしてください");
    }
    onProgress?.(100);
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "reel"}.mp4`, {
      type: "video/mp4",
    });
  } finally {
    // Worker終了がWASM heapとMEMFSをまとめて解放する。例外・キャンセル時も必ず実行。
    ffmpeg.off("progress", progress);
    ffmpeg.terminate();
  }
  } catch (cause) {
    console.error("[reel-transcode] failed", {
      stage,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      error: cause,
    });
    throw cause;
  }
}

/** 再エンコード無しでコンテナだけmp4に統一し、moov atomを先頭に移動する(高速)。 */
async function remuxForFaststart(file: File): Promise<File> {
  const [{ FFmpeg }, { fetchFile }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);
  const ffmpeg = new FFmpeg();
  const input = `input.${inputExtension(file)}`;
  const output = "reel.mp4";
  try {
    const baseUrl = window.location.origin;
    await ffmpeg.load({
      coreURL: `${baseUrl}/ffmpeg/ffmpeg-core.js`,
      wasmURL: `${baseUrl}/ffmpeg/ffmpeg-core.wasm`,
    });
    const inputBytes = await fetchFile(file);
    await ffmpeg.writeFile(input, inputBytes);
    const result = await ffmpeg.exec(["-i", input, "-c", "copy", "-movflags", "+faststart", output], 60_000);
    if (result !== 0) throw new Error("remux failed");
    const data = await ffmpeg.readFile(output);
    const bytes = new Uint8Array(data as Uint8Array);
    const blob = new Blob([bytes.buffer], { type: "video/mp4" });
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "reel"}.mp4`, { type: "video/mp4" });
  } finally {
    ffmpeg.terminate();
  }
}

function isPortraitVideo(file: File): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const portrait = video.videoHeight > video.videoWidth;
      URL.revokeObjectURL(url);
      resolve(portrait);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("動画情報を読み取れませんでした"));
    };
    video.src = url;
  });
}

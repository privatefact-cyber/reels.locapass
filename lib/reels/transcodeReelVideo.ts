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

export async function transcodeReelVideo(file: File, onProgress?: Progress): Promise<File> {
  if (!file.type.startsWith("video/")) return file;
  // CapCut等で既に圧縮済みの動画は、Worker/WASMを一切ロードせずそのまま直送する。
  if (file.size <= TRANSCODE_THRESHOLD_BYTES) return file;

  const [{ FFmpeg }, { fetchFile }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);
  const ffmpeg = new FFmpeg();
  const input = `input.${inputExtension(file)}`;
  const output = "reel.mp4";
  const isPortrait = await isPortraitVideo(file);
  const filter = isPortrait
    ? "fps=24,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
    : "fps=24,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080";
  const progress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(1, Math.min(99, Math.round(progress * 100))));
  };

  ffmpeg.on("progress", progress);
  try {
    onProgress?.(1);
    const baseUrl = window.location.origin;
    // @ffmpeg/core は pthread を含まない単一スレッド版。COOP/COEP は不要。
    await ffmpeg.load({
      coreURL: `${baseUrl}/ffmpeg/ffmpeg-core.js`,
      wasmURL: `${baseUrl}/ffmpeg/ffmpeg-core.wasm`,
    });
    await ffmpeg.writeFile(input, await fetchFile(file));
    const result = await ffmpeg.exec([
      "-i", input, "-t", "30.5", "-vf", filter, "-r", "24",
      "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p",
      "-b:v", "3200k", "-maxrate", "3500k", "-bufsize", "7000k", "-preset", "veryfast",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000",
      "-movflags", "+faststart", output,
    ], 300_000);
    if (result !== 0) throw new Error("動画の変換に失敗しました");
    const data = await ffmpeg.readFile(output);
    const blob = new Blob([data as Uint8Array], { type: "video/mp4" });
    if (blob.size > MAX_REEL_OUTPUT_BYTES) {
      throw new Error("変換後の動画が15MBを超えました。短い動画にしてください");
    }
    onProgress?.(100);
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "reel"}.mp4`, { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", progress);
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

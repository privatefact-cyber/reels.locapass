"use client";

/**
 * リール動画の投稿前処理。
 *
 * R2はCloudflare Streamと違いサーバー側トランスコードが一切無いため、moov atomを
 * 先頭に置く(faststart)処理は必須(末尾のままだと全体ダウンロードが終わるまで
 * 再生が始まらず、フィードが致命的に遅くなる)。
 *
 * 「フル再エンコード(veryfast等の遅いpreset + 解像度統一)」はスマホのSafari上で
 * ffmpeg.wasmを使うとCPUネックで数十秒〜数分かかり実用に耐えなかったため撤去し、
 * 代わりに ultrafast preset + ビットレート上限 の軽い再エンコードのみ行う。
 * 解像度はそのまま(スケーリング計算をしない分ここも速い)、ビットレートだけ
 * 抑えることでファイルサイズを縮め、アップロード時間も短縮する。
 */

export const TARGET_VIDEO_BITRATE_KBPS = 2500;

type Progress = (percent: number) => void;

/** ffmpeg.load()等が(ネットワーク不調やWorker初期化失敗で)応答を返さないまま
 *  固まるケースへの保険。指定時間内に完了しなければreject する。 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        window.clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

function inputExtension(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : "bin";
}

/**
 * 動画をmp4コンテナに統一し、faststart + 軽量ビットレート圧縮を行う。
 * 失敗した場合は例外を投げる。呼び出し側で元ファイルへのフォールバックを行うこと。
 */
export async function transcodeReelVideo(file: File, onProgress?: Progress): Promise<File> {
  if (!file.type.startsWith("video/")) return file;

  const [{ FFmpeg }, { fetchFile }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);
  const ffmpeg = new FFmpeg();
  const input = `input.${inputExtension(file)}`;
  const output = "reel.mp4";

  const progress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(1, Math.min(99, Math.round(progress * 100))));
  };
  ffmpeg.on("progress", progress);

  try {
    onProgress?.(1);
    const baseUrl = window.location.origin;
    await withTimeout(
      ffmpeg.load({
        coreURL: `${baseUrl}/ffmpeg/ffmpeg-core.js`,
        wasmURL: `${baseUrl}/ffmpeg/ffmpeg-core.wasm`,
      }),
      20_000,
      "ffmpeg core load",
    );
    const inputBytes = await fetchFile(file);
    await ffmpeg.writeFile(input, inputBytes);
    const result = await withTimeout(
      ffmpeg.exec([
        "-i", input,
        // 解像度はそのまま(スケーリング演算をしない分、ultrafastと合わせて速い)。
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-b:v", `${TARGET_VIDEO_BITRATE_KBPS}k`,
        "-maxrate", `${Math.round(TARGET_VIDEO_BITRATE_KBPS * 1.15)}k`,
        "-bufsize", `${TARGET_VIDEO_BITRATE_KBPS * 2}k`,
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        output,
      ]),
      60_000,
      "video encode",
    );
    if (result !== 0) throw new Error("動画の変換に失敗しました");
    const data = await ffmpeg.readFile(output);
    // FFmpegの返り値はArrayBufferLikeを持つ型。コピーして通常のArrayBufferへ
    // 正規化し、SafariとNext.jsの型検査の両方で安全にBlob化する。
    const bytes = new Uint8Array(data as Uint8Array);
    const blob = new Blob([bytes.buffer], { type: "video/mp4" });
    onProgress?.(100);
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "reel"}.mp4`, {
      type: "video/mp4",
    });
  } finally {
    // Worker終了がWASM heapとMEMFSをまとめて解放する。例外・キャンセル時も必ず実行。
    ffmpeg.off("progress", progress);
    ffmpeg.terminate();
  }
}

"use client";

/**
 * リール動画の投稿前処理。
 *
 * R2はCloudflare Streamと違いサーバー側トランスコードが一切無いため、moov atomを
 * 先頭に置く(faststart)処理は必須(末尾のままだと全体ダウンロードが終わるまで
 * 再生が始まらず、フィードが致命的に遅くなる)。一方で解像度統一やビットレート
 * 圧縮のための「フル再エンコード(pixelの再計算)」はスマホのSafari上でffmpeg.wasm
 * を使うとCPUネックで数十秒〜数分かかり実用に耐えないため行わない。
 * 常に -c copy(再エンコード無し)でコンテナをmp4に統一しfaststartだけ付与する、
 * 数秒で終わる軽量remuxのみを行う。
 */

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
 * 動画をmp4コンテナに統一しfaststart化する(再エンコード無し、数秒で完了)。
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
    onProgress?.(50);
    const result = await withTimeout(
      ffmpeg.exec(["-i", input, "-c", "copy", "-movflags", "+faststart", output]),
      30_000,
      "faststart remux",
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
    ffmpeg.terminate();
  }
}

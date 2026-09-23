"use client";

/**
 * リール動画の投稿前処理。
 *
 * R2はCloudflare Streamと違いサーバー側トランスコードが一切無いため、moov atomを
 * 先頭に置く(faststart)処理は必須(末尾のままだと全体ダウンロードが終わるまで
 * 再生が始まらず、フィードが致命的に遅くなる)。
 *
 * -c copy(ストリームコピー)のみだとfaststartは効くが、スマホの生ビットレート
 * (実測で最大20Mbps近く)がそのまま乗るため、50MB級のファイルになり回線次第で
 * 再生開始まで長く待たされる(luxela.jp側で2026-09-23に実際の投稿で8秒以上の
 * バッファリングを確認、同じパイプラインのためlocapass.net側にも適用)。
 * 短辺720px・24fpsへ縮小した上でx264 ultrafastプリセットで再エンコードし、
 * ファイルサイズ・再生開始までの待ち時間を大きく縮める。CRFで画質を保ちつつ、
 * maxrate/bufsizeは「暴れた時の上限」としてのみ効かせる(固定の低ビットレート
 * キャップのような常時圧縮ではないため、暗所・ネオン等でのブロックノイズは出にくい)。
 */

const SCALE_SHORT_EDGE = 720;
const TARGET_FPS = 24;

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
 * 動画をmp4コンテナに統一し、短辺720px・24fpsへ縮小しつつfaststart化する。
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
      ffmpeg.exec([
        "-i", input,
        // 縦横どちらでも短辺をSCALE_SHORT_EDGEへ揃える(9:16の縦動画なら幅が短辺)。
        // -2はもう一方の辺を偶数値に自動計算(x264はodd値を受け付けないため)。
        "-vf", `scale='if(gt(iw,ih),-2,${SCALE_SHORT_EDGE})':'if(gt(iw,ih),${SCALE_SHORT_EDGE},-2)',fps=${TARGET_FPS}`,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        // maxrate/bufsizeは常時の圧縮目標ではなく「暗所・激しい動きで暴れた時」の上限のみ。
        // CRFベースなので、固定低ビットレートキャップのようなブロックノイズは出にくい。
        "-maxrate", "6000k",
        "-bufsize", "12000k",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        output,
      ]),
      45_000,
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
    ffmpeg.terminate();
  }
}

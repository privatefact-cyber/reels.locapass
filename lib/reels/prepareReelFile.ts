"use client";

// リール投稿ファイルのアップロード前チェック+スマホ最適化。
//
// スマホで4K撮影された動画は、ファイルサイズ自体は上限(20MB)以下に収まっていても
// 解像度が高いままだとフィード側でのデコード負荷が大きく、再生がもたつく原因になる。
// そのため長辺がMAX_VIDEO_LONG_EDGEを超える動画は、Canvas + MediaRecorderでその場で
// スマホ向け解像度に再エンコードしてからアップロードする。
//
// captureStream/MediaRecorderに対応していないブラウザや、エンコードに失敗した場合は
// アップロード自体をブロックしないよう元ファイルをそのまま返す(ベストエフォート)。

export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
// 元動画はブラウザ内で変換するため、20MBを超えていても受け入れる。
// iOS SafariでWASM heapと入力Blobを同時に保持してもタブが落ちにくい上限。
export const MAX_SOURCE_VIDEO_SIZE_MB = 150;
export const MAX_VIDEO_DURATION_SECONDS = 30.5;
// スマホ最適化解像度(長辺)。フィードは9:16の縦画面でしか再生されないため、
// これ以上の解像度で保持してもモバイル端末では画質差がほぼ体感できない一方、
// デコード負荷とファイルサイズだけが増える。
export const MAX_VIDEO_LONG_EDGE = 1280;
const TARGET_VIDEO_BITRATE = 2_500_000;

// マップのカード用プレビュー。カードは小さく無音で流すだけなので、先頭数秒を低解像度で持てば足りる。
// 元動画(平均3MB前後)をそのまま流すと転送量がそのまま課金になるため、1/10程度に抑える。
const PREVIEW_LONG_EDGE = 480;
const PREVIEW_MAX_SECONDS = 6;
const PREVIEW_VIDEO_BITRATE = 600_000;

type VideoMeta = { duration: number; width: number; height: number };

// captureStreamは標準のlib.dom.d.tsにまだ含まれていないため、最小限の型を補う。
type CaptureCapableVideo = HTMLVideoElement & { captureStream: () => MediaStream };

function loadVideoMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("failed to read video metadata"));
    };
    video.src = URL.createObjectURL(file);
  });
}

/** サイズ・動画の長さをチェックし、問題があればエラーメッセージを返す(問題無ければnull)。 */
export async function validateReelFile(file: File): Promise<string | null> {
  const maximumSize = file.type.startsWith("video/")
    ? MAX_SOURCE_VIDEO_SIZE_MB * 1024 * 1024
    : MAX_FILE_SIZE_BYTES;
  if (file.size > maximumSize) {
    const maximumSizeMb = file.type.startsWith("video/") ? MAX_SOURCE_VIDEO_SIZE_MB : MAX_FILE_SIZE_MB;
    return `ファイルサイズが大きすぎます(上限${maximumSizeMb}MB)。動画を短くするか、解像度を下げてから選び直してください`;
  }
  if (file.type.startsWith("video/")) {
    const meta = await loadVideoMeta(file).catch(() => null);
    if (meta && meta.duration > MAX_VIDEO_DURATION_SECONDS) {
      return `動画は${MAX_VIDEO_DURATION_SECONDS}秒以内にしてください(選択した動画: 約${Math.round(meta.duration)}秒)`;
    }
  }
  return null;
}

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

type ReencodeOptions = {
  longEdge: number;
  bitrate: number;
  /** 先頭から何秒までを書き出すか(未指定なら最後まで)。 */
  maxSeconds?: number;
  /** 音声を含めるか。カード用プレビューは無音再生なので含めない。 */
  withAudio: boolean;
};

/**
 * Canvas + MediaRecorderで動画を再エンコードする。非対応環境・失敗時はnull。
 * 長辺がoptions.longEdge以下の動画も縮小はしないがそのまま再エンコードする
 * (呼び出し側で要否を判断すること)。
 */
async function reencodeVideo(file: File, meta: VideoMeta, options: ReencodeOptions): Promise<File | null> {
  const mimeType = pickSupportedMimeType();
  if (
    !mimeType ||
    typeof (HTMLVideoElement.prototype as Partial<CaptureCapableVideo>).captureStream !== "function"
  ) {
    return null;
  }

  const longEdge = Math.max(meta.width, meta.height);
  const scale = Math.min(1, options.longEdge / longEdge);
  const width = Math.max(2, Math.round((meta.width * scale) / 2) * 2);
  const height = Math.max(2, Math.round((meta.height * scale) / 2) * 2);
  const recordSeconds = Math.min(meta.duration || MAX_VIDEO_DURATION_SECONDS, options.maxSeconds ?? Infinity);

  return new Promise<File | null>((resolve) => {
    const video = document.createElement("video");
    // 音声はcaptureStream経由で取得するため、ここでのミュートは
    // 処理中に音が二重再生されるのを防ぐためだけの措置(キャプチャ内容には影響しない)。
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    // 一部ブラウザ(特にiOS Safari)はDOMにアタッチされていない<video>の
    // デコード/描画を間引くことがあるため、画面外に実サイズで配置して確実に描画させる。
    video.style.position = "fixed";
    video.style.top = "-9999px";
    video.style.left = "-9999px";
    video.style.width = `${width}px`;
    video.style.height = `${height}px`;
    document.body.appendChild(video);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    let settled = false;
    let rafId = 0;
    const cleanup = () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(fallbackTimer);
      URL.revokeObjectURL(video.src);
      video.remove();
    };
    const finish = (result: File | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    // 想定外の理由で完了イベントが発火しない場合の保険(書き出す長さ+15秒でタイムアウト)。
    const fallbackTimer = window.setTimeout(() => finish(null), recordSeconds * 1000 + 15000);

    video.onerror = () => finish(null);

    video.onloadedmetadata = async () => {
      if (!ctx) {
        finish(null);
        return;
      }

      let stream: MediaStream;
      try {
        const canvasStream = canvas.captureStream(30);
        if (options.withAudio) {
          // video.captureStream()の音声トラックは、Chrome系ブラウザでは要素が
          // muted=trueだと無音になってしまう(処理中の二重再生防止のため上でmuted
          // にしているのが裏目に出る)。Web Audio経由でタップすれば要素のmuted状態に
          // 左右されず、かつaudioCtx.destinationへは繋がないので二重再生も起きない。
          const audioCtx = new AudioContext();
          await audioCtx.resume().catch(() => {});
          const source = audioCtx.createMediaElementSource(video);
          const audioDest = audioCtx.createMediaStreamDestination();
          source.connect(audioDest);
          stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);
        } else {
          stream = new MediaStream(canvasStream.getVideoTracks());
        }
      } catch {
        finish(null);
        return;
      }

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: options.bitrate });
      } catch {
        finish(null);
        return;
      }

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onerror = () => finish(null);
      recorder.onstop = () => {
        if (chunks.length === 0) {
          finish(null);
          return;
        }
        const blob = new Blob(chunks, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        const name = file.name.replace(/\.[^.]+$/, "") + `.${ext}`;
        finish(new File([blob], name, { type: mimeType }));
      };

      const stopRecording = () => {
        if (recorder.state !== "inactive") recorder.stop();
        video.pause();
      };

      const drawFrame = () => {
        if (video.paused || video.ended) return;
        ctx.drawImage(video, 0, 0, width, height);
        if (video.currentTime >= recordSeconds) {
          stopRecording();
          return;
        }
        rafId = requestAnimationFrame(drawFrame);
      };

      video.onended = stopRecording;

      video
        .play()
        .then(() => {
          recorder.start();
          drawFrame();
        })
        .catch(() => finish(null));
    };
  }).catch(() => null);
}

/**
 * 長辺がMAX_VIDEO_LONG_EDGEを超える動画をスマホ最適化解像度にダウンスケールする。
 * 非対応環境・失敗時、または元々長辺が上限以下の場合は元ファイルをそのまま返す。
 */
export async function optimizeReelVideo(file: File): Promise<File> {
  if (!file.type.startsWith("video/")) return file;

  let meta: VideoMeta;
  try {
    meta = await loadVideoMeta(file);
  } catch {
    return file;
  }

  const longEdge = Math.max(meta.width, meta.height);
  if (!longEdge || longEdge <= MAX_VIDEO_LONG_EDGE) return file;

  const optimized = await reencodeVideo(file, meta, {
    longEdge: MAX_VIDEO_LONG_EDGE,
    bitrate: TARGET_VIDEO_BITRATE,
    withAudio: true,
  });
  return optimized ?? file;
}

/**
 * マップのカード用の軽量プレビュー(先頭6秒・長辺480px・無音)を作る。
 * 作れなかったときはnull(カードは元動画で代用するので、投稿自体は止めない)。
 */
export async function createReelPreviewVideo(file: File): Promise<File | null> {
  if (!file.type.startsWith("video/")) return null;

  let meta: VideoMeta;
  try {
    meta = await loadVideoMeta(file);
  } catch {
    return null;
  }
  if (!meta.width || !meta.height) return null;

  return reencodeVideo(file, meta, {
    longEdge: PREVIEW_LONG_EDGE,
    bitrate: PREVIEW_VIDEO_BITRATE,
    maxSeconds: PREVIEW_MAX_SECONDS,
    withAudio: false,
  });
}

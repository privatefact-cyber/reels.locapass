"use client";

/**
 * 画像(AI画像・店舗の写真・自分の写真)から、リール用の縦動画(9:16・約6秒・ゆっくりズーム)を、ブラウザで作る。
 * 変換は、既存のブラウザ内FFmpeg(/ffmpeg/ のコア)を使う。サーバーでは動画を作らない。
 * 音楽は付けない(音楽は権利の確認ができた音源だけにするため、別機能で扱う)。
 */
const W = 720;
const H = 1280;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を読み込めませんでした"));
    img.src = src;
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label}が時間内に終わりませんでした`)), ms);
    promise.then((v) => { window.clearTimeout(timer); resolve(v); }, (e) => { window.clearTimeout(timer); reject(e); });
  });
}

/** 9:16のキャンバスに、画像を収める。縦長でない画像は、ぼかした同じ画像を背景に敷く。 */
async function composeFrame(dataUrl: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を作れませんでした");
  const img = await loadImage(dataUrl);
  // 背景: 画面いっぱいに引き伸ばして、ぼかす
  const cover = Math.max(W / img.width, H / img.height);
  ctx.fillStyle = "#14161e";
  ctx.fillRect(0, 0, W, H);
  if ("filter" in ctx) ctx.filter = "blur(28px)";
  ctx.drawImage(img, (W - img.width * cover) / 2, (H - img.height * cover) / 2, img.width * cover, img.height * cover);
  if ("filter" in ctx) ctx.filter = "none";
  ctx.fillStyle = "rgba(10,12,20,0.35)";
  ctx.fillRect(0, 0, W, H);
  // 前面: 幅いっぱいに収める(縦長なら高さいっぱい)
  const fit = Math.min(W / img.width, H / img.height);
  const w = img.width * fit; const h = img.height * fit;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を作れませんでした"))), "image/png"));
}

export async function imageToReelFile(dataUrl: string, onProgress?: (percent: number) => void): Promise<File> {
  const frame = await composeFrame(dataUrl);
  const [{ FFmpeg }, { fetchFile }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => onProgress?.(Math.max(0, Math.min(99, Math.round(progress * 100)))));
  try {
    const base = window.location.origin;
    await withTimeout(ffmpeg.load({ coreURL: `${base}/ffmpeg/ffmpeg-core.js`, wasmURL: `${base}/ffmpeg/ffmpeg-core.wasm` }), 30_000, "動画変換の準備");
    await ffmpeg.writeFile("frame.png", await fetchFile(frame));
    const code = await withTimeout(
      ffmpeg.exec([
        "-loop", "1", "-framerate", "24", "-t", "6", "-i", "frame.png",
        "-vf", `zoompan=z='min(zoom+0.0006,1.09)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=24,format=yuv420p`,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", "reel.mp4",
      ]),
      150_000,
      "動画の変換",
    );
    if (code !== 0) throw new Error("動画の変換に失敗しました");
    const data = await ffmpeg.readFile("reel.mp4");
    onProgress?.(100);
    return new File([new Uint8Array(data as Uint8Array).buffer], "reel.mp4", { type: "video/mp4" });
  } finally {
    ffmpeg.terminate();
  }
}

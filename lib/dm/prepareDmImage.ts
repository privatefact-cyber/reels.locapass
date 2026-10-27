"use client";

const MAX_LONG_EDGE = 1280;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/** DM添付用に、長辺1280pxのJPEGへ縮小する(割引チケット等の文字が読める解像度を保ちつつ、転送量を抑える)。 */
export async function prepareDmImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選んでください");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("画像は15MB以下にしてください");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を処理できませんでした");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("画像を処理できませんでした");
  return blob;
}

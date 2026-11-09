"use client";

/**
 * チラシ画像を、ブラウザで作る。AIが作った「文字なしのイラスト」の上に、見出しを正しい日本語のフォントで重ねる。
 * (AIに文字を描かせると、日本語が崩れるため。文字はこちらで描くので、崩れない)
 */
const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を読み込めませんでした"));
    img.src = src;
  });
}

/** 見出しを、幅に収まるよう1〜2行に分ける(「\n」で、手で改行も可)。 */
function wrapHeadline(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number): string[] {
  const manual = text.split(/\n/).map((t) => t.trim()).filter(Boolean);
  if (manual.length > 1) return manual.slice(0, 3);
  const chars = [...text.trim()];
  ctx.font = `800 ${size}px ${FONT}`;
  if (ctx.measureText(chars.join("")).width <= maxWidth) return [chars.join("")];
  const half = Math.ceil(chars.length / 2);
  return [chars.slice(0, half).join(""), chars.slice(half).join("")];
}

export async function composeFlyerJpeg(baseDataUrl: string, headline: string, brand: string): Promise<Blob> {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を作れませんでした");
  const img = await loadImage(baseDataUrl);
  ctx.drawImage(img, 0, 0, size, size);

  // 文字が読みやすいよう、中央に半透明の帯を敷く
  const text = headline.trim() || brand;
  const maxWidth = size * 0.86;
  let fontSize = 150;
  let lines = wrapHeadline(ctx, text, maxWidth, fontSize);
  while (fontSize > 48) {
    ctx.font = `800 ${fontSize}px ${FONT}`;
    if (Math.max(...lines.map((l) => ctx.measureText(l).width)) <= maxWidth) break;
    fontSize -= 6;
    lines = wrapHeadline(ctx, text, maxWidth, fontSize);
  }
  const lineHeight = fontSize * 1.25;
  const blockHeight = lineHeight * lines.length + 70;
  const top = (size - blockHeight) / 2;
  ctx.fillStyle = "rgba(15, 18, 30, 0.55)";
  ctx.fillRect(0, top, size, blockHeight);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${fontSize}px ${FONT}`;
  ctx.lineJoin = "round";
  lines.forEach((line, i) => {
    const y = top + 35 + lineHeight * (i + 0.5);
    ctx.lineWidth = Math.max(6, fontSize / 12);
    ctx.strokeStyle = "rgba(20, 22, 40, 0.9)";
    ctx.strokeText(line, size / 2, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, size / 2, y);
  });

  // サービス名(小さく)
  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.strokeStyle = "rgba(20,22,40,0.8)";
  ctx.lineWidth = 6;
  ctx.strokeText(brand, size / 2, size - 54);
  ctx.fillText(brand, size / 2, size - 54);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を作れませんでした"))), "image/jpeg", 0.9));
}

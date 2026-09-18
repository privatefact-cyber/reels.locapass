"use client";

// 画像・動画を選ばずにテキストのみで投稿されたとき、リールフィードに載せるための
// 「黒背景+大きな白文字」カード画像をその場で生成する(9:16、キャプションカード用)。
// 大きな文字として乗せるのは先頭40文字までとし、それ以降はreels.captionにそのまま
// 保存して「続きを読む」モーダルで読ませる想定。

export const BIG_TEXT_MAX_LENGTH = 40;

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const HORIZONTAL_PADDING = 96;
const FONT_SIZE = 72;
const LINE_HEIGHT = 100;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    const next = current + char;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** 本文の先頭40文字を、黒背景に白い大きな文字で中央配置したPNG画像として書き出す。 */
export async function generateTextCardImage(text: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像の生成に対応していないブラウザです");

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const display = text.slice(0, BIG_TEXT_MAX_LENGTH);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${FONT_SIZE}px "Hiragino Sans", "Noto Sans JP", sans-serif`;

  const maxWidth = CANVAS_WIDTH - HORIZONTAL_PADDING * 2;
  const lines = wrapText(ctx, display, maxWidth);
  const startY = CANVAS_HEIGHT / 2 - ((lines.length - 1) * LINE_HEIGHT) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, CANVAS_WIDTH / 2, startY + i * LINE_HEIGHT);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("画像の生成に失敗しました"));
    }, "image/png");
  });
}

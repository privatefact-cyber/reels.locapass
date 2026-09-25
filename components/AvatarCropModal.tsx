"use client";

import { useEffect, useRef, useState } from "react";

const CANVAS_SIZE = 320;

type Offset = { x: number; y: number };

/**
 * アイコン画像の円形クロップモーダル(Instagram風)。
 * portal.modella.jp(WordPress版)のマイページで使っている
 * canvas手動描画(パン+ズーム)方式を移植したもの。
 */
export function AvatarCropModal({
  file,
  onCancel,
  onCropped,
}: {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const baseScaleRef = useRef(1);
  const zoomRef = useRef(1);
  const offsetRef = useRef<Offset>({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const dragStartRef = useRef<Offset>({ x: 0, y: 0 });
  const dragOffsetStartRef = useRef<Offset>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);

  function clampOffset() {
    const img = imageRef.current;
    if (!img) return;
    const w = img.naturalWidth * baseScaleRef.current * zoomRef.current;
    const h = img.naturalHeight * baseScaleRef.current * zoomRef.current;
    const minX = Math.min(0, CANVAS_SIZE - w);
    const minY = Math.min(0, CANVAS_SIZE - h);
    offsetRef.current.x = Math.max(minX, Math.min(0, offsetRef.current.x));
    offsetRef.current.y = Math.max(minY, Math.min(0, offsetRef.current.y));
  }

  function draw() {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !img || !ctx) return;
    clampOffset();
    const w = img.naturalWidth * baseScaleRef.current * zoomRef.current;
    const h = img.naturalHeight * baseScaleRef.current * zoomRef.current;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(img, offsetRef.current.x, offsetRef.current.y, w, h);
  }

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        const base = Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight);
        baseScaleRef.current = base;
        zoomRef.current = 1;
        setZoom(1);
        offsetRef.current = {
          x: (CANVAS_SIZE - img.naturalWidth * base) / 2,
          y: (CANVAS_SIZE - img.naturalHeight * base) / 2,
        };
        setReady(true);
        draw();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  function handleZoomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const prevZoom = zoomRef.current;
    const nextZoom = parseFloat(e.target.value) || 1;
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    offsetRef.current.x = cx - (cx - offsetRef.current.x) * (nextZoom / prevZoom);
    offsetRef.current.y = cy - (cy - offsetRef.current.y) * (nextZoom / prevZoom);
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    draw();
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    draggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragOffsetStartRef.current = { ...offsetRef.current };
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!draggingRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleRatio = canvasRef.current.width / rect.width;
    offsetRef.current = {
      x: dragOffsetStartRef.current.x + (e.clientX - dragStartRef.current.x) * scaleRatio,
      y: dragOffsetStartRef.current.y + (e.clientY - dragStartRef.current.y) * scaleRatio,
    };
    draw();
  }

  function endDrag() {
    draggingRef.current = false;
  }

  function handleApply() {
    canvasRef.current?.toBlob(
      (blob) => {
        if (blob) onCropped(blob);
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-sm font-semibold text-main">アイコン画像を調整</h2>

        <div className="relative mx-auto mt-4 h-[320px] w-[320px]">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="touch-none rounded-lg"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
          {/* 円形ガイド: 外側を暗くして「ここが実際に使われる範囲」を示す */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-main/90"
            style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
          />
        </div>

        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={handleZoomChange}
          disabled={!ready}
          className="mt-4 w-full accent-brand"
          aria-label="拡大率"
        />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded border border-main/20 py-2 text-sm text-tone-300"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!ready}
            className="flex-1 rounded bg-brand py-2 text-sm font-semibold text-main hover:bg-brand-dark disabled:opacity-50"
          >
            この画像で保存
          </button>
        </div>
      </div>
    </div>
  );
}

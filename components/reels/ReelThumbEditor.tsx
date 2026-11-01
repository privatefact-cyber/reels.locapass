"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { posterImage } from "@/lib/images/thumb";

type FocusApi = { imageUrl?: string | null; x?: number | null; y?: number | null };

/**
 * 「写真のどこを見せるか」を決めるモーダル(リールの一覧タイル=正方形、キャストの一覧カード=3:4 など)。
 * 元の写真の上に、見せる部分の枠(縦横比 aspect)を重ねて、ドラッグまたはつまみで動かす。
 * 動かせる向きは、写真が枠より縦に長ければ上下、横に長ければ左右。保存する値は、CSSの object-position と同じ(0〜100%)。
 */
function ThumbFocusModal({
  apiUrl,
  aspect,
  title,
  description,
  previewLabel,
  savedMessage,
  onClose,
}: {
  apiUrl: string;
  /** 見せる部分の縦横比(幅÷高さ)。正方形=1、3:4=0.75。 */
  aspect: number;
  title: string;
  description: string;
  previewLabel: string;
  savedMessage: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [saved, setSaved] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: FocusApi | null) => {
        if (cancelled) return;
        setImageUrl(json?.imageUrl ?? null);
        setX(json?.x ?? 50);
        setY(json?.y ?? 50);
        setSaved({ x: json?.x ?? null, y: json?.y ?? null });
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  // 動かせる向き: 写真の方が枠より横に長ければ左右(x)、縦に長ければ上下(y)。同じ比率なら動かす必要がない。
  const imageAspect = natural ? natural.w / natural.h : null;
  const axis: "x" | "y" | null = imageAspect === null ? null : imageAspect > aspect + 0.005 ? "x" : imageAspect < aspect - 0.005 ? "y" : null;
  const value = axis === "x" ? x : y;
  const setValue = useCallback(
    (v: number) => {
      const clamped = Math.min(100, Math.max(0, Math.round(v)));
      setMessage(null);
      if (axis === "x") setX(clamped);
      else setY(clamped);
    },
    [axis],
  );

  // 表示用: 画像を縮小して表示し、その上に枠を重ねる。縦長の写真でも、下の見本が隠れないよう、高さを抑える。
  const MAX_W = 260;
  const MAX_H = 360;
  const dispW = natural ? Math.min(MAX_W, (MAX_H * natural.w) / natural.h) : MAX_W;
  const dispH = natural ? (dispW * natural.h) / natural.w : MAX_W;
  const frameW = axis === "x" ? dispH * aspect : dispW;
  const frameH = axis === "x" ? dispH : dispW / aspect;
  const freeX = Math.max(0, dispW - frameW);
  const freeY = Math.max(0, dispH - frameH);
  const frameLeft = axis === "x" ? (x / 100) * freeX : 0;
  const frameTop = axis === "y" ? (y / 100) * freeY : 0;

  const drag = useRef<{ startPointer: number; startValue: number } | null>(null);
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!axis) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startPointer: axis === "x" ? e.clientX : e.clientY, startValue: value };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current || !axis) return;
    const free = axis === "x" ? freeX : freeY;
    if (free <= 0) return;
    const delta = (axis === "x" ? e.clientX : e.clientY) - drag.current.startPointer;
    setValue(drag.current.startValue + (delta / free) * 100);
  }
  function onPointerUp() {
    drag.current = null;
  }

  const current = { x: axis === "x" ? x : axis === "y" ? 50 : null, y: axis === "y" ? y : axis === "x" ? 50 : null };
  const changed = current.x !== saved.x || current.y !== saved.y;

  async function send(body: { x: number | null; y: number | null }) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(json.error ?? "保存に失敗しました");
        return false;
      }
      setSaved(body);
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (await send({ x: current.x, y: current.y })) setMessage(savedMessage);
  }
  async function reset() {
    if (await send({ x: null, y: null })) {
      setX(50);
      setY(50);
      setMessage("中央に戻しました");
    }
  }

  const src = imageUrl ? posterImage(imageUrl, 720) : undefined;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl bg-white text-slate-900 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-xs text-slate-500 underline">
            閉じる
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!loaded ? (
            <p className="py-6 text-center text-sm text-slate-500">読み込み中…</p>
          ) : !src ? (
            <p className="py-6 text-center text-sm text-slate-500">
              位置を決められる画像がありません(写真が未登録、または動画のサムネイルがまだ作られていない可能性があります)。
            </p>
          ) : (
            <>
              <p className="mb-3 text-[11px] text-slate-500">{description}</p>
              <div className="flex flex-col items-center gap-3">
                <div
                  className="relative touch-none select-none overflow-hidden rounded-lg bg-slate-200"
                  style={{ width: dispW, height: dispH }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                    className="h-full w-full"
                  />
                  {axis && (
                    <div
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                      className={`absolute border-2 border-white ${axis === "y" ? "cursor-ns-resize" : "cursor-ew-resize"}`}
                      style={{
                        left: frameLeft,
                        top: frameTop,
                        width: frameW,
                        height: frameH,
                        boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                      }}
                    />
                  )}
                </div>
                {axis ? (
                  <label className="flex w-full items-center gap-2 text-xs text-slate-600">
                    <span>{axis === "y" ? "上" : "左"}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={value}
                      onChange={(e) => setValue(Number(e.target.value))}
                      className="flex-1"
                      aria-label="写真の位置"
                    />
                    <span>{axis === "y" ? "下" : "右"}</span>
                  </label>
                ) : (
                  natural && <p className="text-xs text-slate-500">この写真は、見せる枠と同じ縦横比なので、位置を動かす必要はありません。</p>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-20 overflow-hidden rounded-md bg-slate-200" style={{ aspectRatio: String(aspect) }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-cover"
                      style={{ objectPosition: `${x}% ${y}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">{previewLabel}</p>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="border-t border-slate-200 px-4 py-3">
          {message && <p className="mb-2 text-xs text-slate-600">{message}</p>}
          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={busy || (saved.x === null && saved.y === null)}
              onClick={reset}
              className="text-xs text-slate-500 underline disabled:opacity-40"
            >
              中央に戻す
            </button>
            <button
              type="button"
              disabled={busy || !changed || !axis}
              onClick={save}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** リール一覧の各サムネイルに置く「サムネ」ボタン。押すと、一覧タイル(正方形)に見せる位置を決めるモーダルが開く。 */
export function ReelThumbEditButton({ reelId, className }: { reelId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={className ?? "rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"}
      >
        サムネ
      </button>
      {open && (
        <ThumbFocusModal
          apiUrl={`/api/reels/${reelId}/thumb`}
          aspect={1}
          title="サムネイルの位置"
          description="トップの一覧・動画ストックなど、写真が正方形に切り抜かれる場所すべてに、ここで決めた位置が反映されます。明るい枠が、正方形に出る部分です。枠をドラッグするか、下のつまみで、顔が入る位置に合わせてください。"
          previewLabel="正方形では、こう見えます。"
          savedMessage="保存しました(各画面には、最大1分ほどで反映されます)"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

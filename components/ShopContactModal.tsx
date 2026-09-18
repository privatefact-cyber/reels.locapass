"use client";

import { useState, useRef } from "react";
import { Phone, MessageCircle, X, Copy, Check } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";

/** 店舗詳細のフローティングメニューから開く「電話・店舗LINE連絡」ボトムシート。 */
export function ShopContactModal({
  open,
  onClose,
  phone,
  lineContactUrl,
  lineQrImageUrl,
}: {
  open: boolean;
  onClose: () => void;
  phone: string | null;
  lineContactUrl: string | null;
  lineQrImageUrl: string | null;
}) {
  const { t } = useLocale();
  const [dragY, setDragY] = useState(0);
  const [qrZoomed, setQrZoomed] = useState(false);
  const [copied, setCopied] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);

  if (!open) return null;

  async function handleCopyPhone() {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードAPIが使えない環境では何もしない(番号は目視でコピー可能)
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    dragging.current = true;
    startY.current = e.touches[0].clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    setDragY(Math.max(0, delta));
  }

  function handleTouchEnd() {
    dragging.current = false;
    if (dragY > 80) {
      onClose();
    }
    setDragY(0);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateY(${dragY}px)`, transition: dragging.current ? "none" : "transform 0.2s ease" }}
        className="w-full max-w-sm rounded-t-2xl border border-amber-500/20 bg-zinc-950 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 sm:rounded-2xl sm:pb-6"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20 sm:hidden" />

        <div className="flex items-center justify-between px-5">
          <h2 className="text-sm font-bold text-neutral-100">{t.contact.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="rounded-full p-1 text-neutral-400 transition hover:text-neutral-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3 px-5">
          {phone && (
            <div>
              <a
                href={`tel:${phone}`}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 text-sm font-semibold text-zinc-950 shadow-[0_0_20px_rgba(245,158,11,0.25)]"
              >
                <Phone size={16} />
                {t.contact.callButton}
              </a>
              <button
                type="button"
                onClick={handleCopyPhone}
                className="mx-auto mt-2 flex items-center gap-1.5 text-xs text-neutral-400 transition hover:text-amber-300"
              >
                <span className="tracking-wide">{phone}</span>
                {copied ? <Check size={13} className="text-amber-400" /> : <Copy size={13} />}
              </button>
              <p className="mt-1 text-center text-[11px] text-neutral-500">
                {copied ? t.contact.copied : t.contact.callHint}
              </p>
            </div>
          )}

          {lineContactUrl && (
            <div>
              <a
                href={lineContactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-300 backdrop-blur-xl transition hover:bg-amber-500/20"
              >
                <MessageCircle size={16} />
                {t.contact.lineButton}
              </a>

              {lineQrImageUrl && (
                <button
                  type="button"
                  onClick={() => setQrZoomed(true)}
                  className="mx-auto mt-3 flex flex-col items-center gap-1.5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lineQrImageUrl}
                    alt={t.contact.lineQrAlt}
                    className="h-24 w-24 rounded-lg border border-white/10 bg-white object-contain p-1"
                  />
                  <span className="text-[11px] text-neutral-500">{t.contact.lineQrHint}</span>
                </button>
              )}
            </div>
          )}

          {!phone && !lineContactUrl && (
            <p className="py-2 text-center text-xs text-neutral-500">{t.contact.noContact}</p>
          )}
        </div>
      </div>

      {qrZoomed && lineQrImageUrl && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-8"
          onClick={(e) => {
            e.stopPropagation();
            setQrZoomed(false);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lineQrImageUrl}
            alt={t.contact.lineQrAlt}
            className="max-h-full max-w-full rounded-xl bg-white p-4"
          />
        </div>
      )}
    </div>
  );
}

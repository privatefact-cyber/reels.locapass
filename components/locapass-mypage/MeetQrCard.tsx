"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { issueMeetQr } from "@/app/met/actions";

/** QRを作り直す間隔。サーバー側の有効期限(10分)より短くして、読み込まれるQRは、いつも有効にする。 */
const REFRESH_MS = 4 * 60 * 1000;

/**
 * 「直接会った人用のQR」。ふだんは隠れていて、「QRを表示」を押したときだけ出る。
 * 数分ごとに自動で変わるので、写真に撮られても、すぐ使えなくなる。読み込んだ人とは、相互フォローになってDMが開く。
 */
export function MeetQrCard() {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const r = await issueMeetQr();
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setExpiresAt(r.expiresAt);
    setDataUrl(await QRCode.toDataURL(r.url, { margin: 1, width: 280 }));
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    timer.current = window.setInterval(() => void refresh(), REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      window.clearInterval(tick);
    };
  }, [open, refresh]);

  function close() {
    setOpen(false);
    setDataUrl(null);
    setExpiresAt(null);
  }

  const remainSec = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 1000)) : null;

  return (
    <section className="mx-4 mt-4 rounded-2xl border border-hl-300/30 bg-tone-900/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-main">🤝 会った人用のQR</p>
          <p className="mt-1 text-xs text-tone-400">直接会った人に読んでもらうと、おたがいにフォローしあって、メッセージを送りあえます。</p>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full bg-hl-300 px-4 py-2 text-sm font-bold text-black">
            QRを表示
          </button>
        )}
      </div>
      {open && (
        <div className="mt-4 flex flex-col items-center gap-3">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt="会った人用のQR" className="h-56 w-56 rounded-xl bg-white p-2" />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center rounded-xl bg-tone-800 text-sm text-tone-400">{error ?? "作成中…"}</div>
          )}
          {error && dataUrl && <p className="text-xs text-red-300">{error}</p>}
          <p className="text-[11px] text-tone-400">
            このQRは、数分ごとに自動で変わります{remainSec != null ? `(あと${Math.floor(remainSec / 60)}分${String(remainSec % 60).padStart(2, "0")}秒で、期限切れ)` : ""}。画面を人に見せるだけで、写真に撮られても大丈夫です。
          </p>
          <button type="button" onClick={close} className="rounded-full border border-tone-600 px-5 py-2 text-sm text-tone-300">
            閉じる
          </button>
        </div>
      )}
    </section>
  );
}
